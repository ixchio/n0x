export interface RAGRelevanceScores {
    /** Cosine similarity from the embedding model. Null when no embedding was used. */
    vector: number | null;
    /** Raw BM25 score for the query and chunk. Null when BM25 was not run. */
    bm25: number | null;
    /** Reciprocal-rank-fusion score. Null for direct, non-indexed documents. */
    fused: number | null;
}

export interface RAGSearchResult {
    documentId: string;
    documentName: string;
    /** One-based chunk index, matching the citation shown to the model. */
    chunkIndex: number;
    text: string;
    relevance: RAGRelevanceScores;
}

interface TextCandidate {
    id: string;
    text: string;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const DIRECT_CHUNK_CHARS = 900;
const DIRECT_CHUNK_OVERLAP = 120;
const WHOLE_DOCUMENT_EXCERPT_CHARS = 220;

// MiniLM cosine values around 0.3 are a conservative semantic match. RRF is
// rank-relative, so it is intentionally not used as an absolute evidence gate.
export const MIN_SEMANTIC_RELEVANCE = 0.3;
export const MIN_HYBRID_SEMANTIC_RELEVANCE = 0.2;

const EVIDENCE_STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "answer",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "document",
    "documents",
    "file",
    "files",
    "for",
    "from",
    "how",
    "in",
    "information",
    "is",
    "it",
    "me",
    "of",
    "on",
    "please",
    "tell",
    "that",
    "the",
    "this",
    "to",
    "uploaded",
    "was",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
]);

export const NO_RAG_EVIDENCE = `## Document evidence
No sufficiently relevant passage was found in the uploaded documents. Do not attribute an answer to those documents or invent a document citation. Say that the uploaded documents do not contain enough evidence for the question.`;

export function tokenizeForRetrieval(value: unknown): string[] {
    const text = typeof value === "string" ? value : String(value ?? "");
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\s]/gu, " ")
        .split(/\s+/)
        .filter(token => token.length > 1);
}

export function calculateBm25Scores(query: string, candidates: readonly TextCandidate[]): Map<string, number> {
    const queryTerms = tokenizeForRetrieval(query);
    const scores = new Map<string, number>();
    if (candidates.length === 0 || queryTerms.length === 0) return scores;

    const tokenized = candidates.map(candidate => ({ candidate, tokens: tokenizeForRetrieval(candidate.text) }));
    const averageLength =
        tokenized.reduce((total, candidate) => total + candidate.tokens.length, 0) / Math.max(tokenized.length, 1);
    const documentFrequency = new Map<string, number>();

    for (const term of queryTerms) {
        documentFrequency.set(
            term,
            tokenized.reduce((count, candidate) => count + (candidate.tokens.includes(term) ? 1 : 0), 0)
        );
    }

    for (const { candidate, tokens } of tokenized) {
        const documentLength = tokens.length;
        let score = 0;

        for (const term of queryTerms) {
            const termFrequency = tokens.reduce((count, token) => count + (token === term ? 1 : 0), 0);
            if (termFrequency === 0) continue;
            const frequency = documentFrequency.get(term) ?? 0;
            const inverseDocumentFrequency = Math.log((candidates.length - frequency + 0.5) / (frequency + 0.5) + 1);
            const lengthRatio = averageLength > 0 ? documentLength / averageLength : 0;
            score +=
                inverseDocumentFrequency *
                ((termFrequency * (BM25_K1 + 1)) / (termFrequency + BM25_K1 * (1 - BM25_B + BM25_B * lengthRatio)));
        }

        scores.set(candidate.id, score);
    }

    return scores;
}

/**
 * Deterministically window a directly injected document so query-relevant
 * passages can be ranked before the prompt budget is applied. Chunk numbers
 * are stable for the same bytes and are used verbatim in citations.
 */
export function chunkDirectEvidence(text: string): Array<{ chunkIndex: number; text: string }> {
    const normalized = text.trim();
    if (!normalized) return [];

    const chunks: Array<{ chunkIndex: number; text: string }> = [];
    let start = 0;

    while (start < normalized.length) {
        let end = Math.min(start + DIRECT_CHUNK_CHARS, normalized.length);
        if (end < normalized.length) {
            const minimumBreak = start + Math.floor(DIRECT_CHUNK_CHARS * 0.65);
            const whitespace = normalized.lastIndexOf(" ", end);
            if (whitespace >= minimumBreak) end = whitespace;
        }

        const chunk = normalized.slice(start, end).trim();
        if (chunk) chunks.push({ chunkIndex: chunks.length + 1, text: chunk });
        if (end >= normalized.length) break;

        const nextStart = Math.max(start + 1, end - DIRECT_CHUNK_OVERLAP);
        const nextWhitespace = normalized.indexOf(" ", nextStart);
        start = nextWhitespace >= 0 && nextWhitespace < end ? nextWhitespace + 1 : nextStart;
    }

    return chunks;
}

function coverageExcerpt(text: string, position: number, count: number): string {
    if (text.length <= WHOLE_DOCUMENT_EXCERPT_CHARS) return text;
    const ratio = count <= 1 ? 0.5 : position / (count - 1);
    const start = Math.round((text.length - WHOLE_DOCUMENT_EXCERPT_CHARS) * ratio);
    const excerpt = text.slice(start, start + WHOLE_DOCUMENT_EXCERPT_CHARS).trim();
    return `${start > 0 ? "…" : ""}${excerpt}${start + WHOLE_DOCUMENT_EXCERPT_CHARS < text.length ? "…" : ""}`;
}

/**
 * Whole-document prompts need breadth rather than four adjacent opening
 * chunks. Allocate the result limit across documents, then sample stable
 * beginning/middle/end positions and shorten each passage so every sample can
 * survive the small-model evidence cap.
 */
export function selectDiverseWholeDocumentEvidence(
    results: readonly RAGSearchResult[],
    limit: number
): RAGSearchResult[] {
    const safeLimit = Math.max(1, Math.floor(limit));
    if (results.length === 0) return [];

    const groups = new Map<string, RAGSearchResult[]>();
    for (const result of results) {
        const group = groups.get(result.documentId) ?? [];
        group.push(result);
        groups.set(result.documentId, group);
    }
    const documents = [...groups.values()].map(group => [...group].sort((a, b) => a.chunkIndex - b.chunkIndex));
    const allocations = documents.map(() => 0);
    let remaining = Math.min(safeLimit, results.length);

    while (remaining > 0) {
        let allocated = false;
        for (let index = 0; index < documents.length && remaining > 0; index++) {
            if (allocations[index] >= documents[index].length) continue;
            allocations[index] += 1;
            remaining -= 1;
            allocated = true;
        }
        if (!allocated) break;
    }

    return documents.flatMap((documentResults, documentIndex) => {
        const count = allocations[documentIndex];
        if (count === 0) return [];

        const selectedIndices =
            count === 1
                ? [Math.floor((documentResults.length - 1) / 2)]
                : Array.from({ length: count }, (_, index) =>
                      Math.round((index * (documentResults.length - 1)) / (count - 1))
                  );

        return selectedIndices.map((resultIndex, position) => {
            const result = documentResults[resultIndex];
            return {
                ...result,
                text: coverageExcerpt(result.text, position, selectedIndices.length),
            };
        });
    });
}

function evidenceTerms(query: string): string[] {
    return Array.from(new Set(tokenizeForRetrieval(query).filter(term => !EVIDENCE_STOP_WORDS.has(term))));
}

function lexicalEvidence(query: string, text: string): { coverage: number; matched: number; total: number } {
    const terms = evidenceTerms(query);
    if (terms.length === 0) return { coverage: 0, matched: 0, total: 0 };
    const textTerms = new Set(tokenizeForRetrieval(text));
    const matched = terms.reduce((count, term) => count + (textTerms.has(term) ? 1 : 0), 0);
    return { coverage: matched / terms.length, matched, total: terms.length };
}

export function isWholeDocumentQuery(query: string): boolean {
    return (
        /\b(summari[sz]e|summary|overview|outline)\b[\s\S]*\b(document|documents|file|files|attachment|attachments)\b/i.test(
            query
        ) ||
        /\b(what is|what's|what does)\b[\s\S]*\b(this|the|uploaded|attached)\s+(document|file|attachment)\b/i.test(
            query
        )
    );
}

export function hasSufficientEvidence(query: string, text: string, relevance: RAGRelevanceScores): boolean {
    if (isWholeDocumentQuery(query)) return text.trim().length > 0;

    const vector = relevance.vector ?? -1;
    if (vector >= MIN_SEMANTIC_RELEVANCE) return true;

    const lexical = lexicalEvidence(query, text);
    const hasBm25Support = (relevance.bm25 ?? 0) > 0;
    if (!hasBm25Support || lexical.total === 0) return false;

    const requiredMatches = lexical.total === 1 ? 1 : Math.max(2, Math.ceil(lexical.total * 0.4));
    const requiredCoverage = lexical.total <= 2 ? 1 : 0.4;
    if (lexical.matched >= requiredMatches && lexical.coverage >= requiredCoverage) return true;

    return vector >= MIN_HYBRID_SEMANTIC_RELEVANCE && lexical.matched >= 1 && lexical.coverage >= 0.25;
}

function evidenceStrength(query: string, result: RAGSearchResult): number {
    const lexical = lexicalEvidence(query, result.text).coverage;
    const vector = Math.max(0, result.relevance.vector ?? 0);
    const bm25 = Math.max(0, result.relevance.bm25 ?? 0);
    const normalizedBm25 = bm25 / (bm25 + 1);
    const normalizedFused = Math.min(1, Math.max(0, result.relevance.fused ?? 0) * 61);
    return vector * 0.5 + lexical * 0.35 + normalizedBm25 * 0.1 + normalizedFused * 0.05;
}

export function rankRagEvidence(results: readonly RAGSearchResult[], query: string): RAGSearchResult[] {
    return results
        .map((result, index) => ({ result, index, strength: evidenceStrength(query, result) }))
        .sort((a, b) => b.strength - a.strength || a.index - b.index)
        .map(item => item.result);
}

export function isRagSearchResult(value: unknown): value is RAGSearchResult {
    if (!value || typeof value !== "object") return false;
    const result = value as Partial<RAGSearchResult>;
    const relevance = result.relevance as Partial<RAGRelevanceScores> | undefined;
    const validScore = (score: unknown) => score === null || (typeof score === "number" && Number.isFinite(score));
    return (
        typeof result.documentId === "string" &&
        typeof result.documentName === "string" &&
        Number.isInteger(result.chunkIndex) &&
        (result.chunkIndex ?? 0) > 0 &&
        typeof result.text === "string" &&
        !!relevance &&
        validScore(relevance.vector) &&
        validScore(relevance.bm25) &&
        validScore(relevance.fused)
    );
}

function citationFileName(name: string): string {
    return name.replace(/[\r\n\[\]]/g, "_").trim() || "document";
}

export function formatRagEvidence(results: readonly RAGSearchResult[]): string {
    if (results.length === 0) return NO_RAG_EVIDENCE;

    const evidence = results
        .map(result => {
            const citation = `[${citationFileName(result.documentName)}#chunk-${result.chunkIndex}]`;
            return `${citation}\n${result.text.trim()}`;
        })
        .join("\n\n");

    return `## Document evidence
Cite document-backed claims with the exact source tag attached to each passage, for example [filename.pdf#chunk-2]. If these passages do not support a claim, say so instead of filling the gap from the document.

${evidence}`;
}
