/// <reference lib="webworker" />

let voy: any = null;
let embedder: any = null;
let VoyClass: any = null;
let pipelineFn: any = null;
let pdfjsLib: any = null;
const RESOURCE_NAME = "Xenova/all-MiniLM-L6-v2";

// chunkId → { text, embedding }
const chunkStore = new Map<string, { text: string; embedding: number[] }>();

const MAX_DIRECT_INJECT_SIZE = 8000;

// --- IndexedDB Caching ---
const DB_NAME = "n0x_rag_cache";
const STORE_NAME = "vectors";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
    });
}

async function getCachedVectors(fileId: string): Promise<{ serializedVoy: string, chunks: [string, string][] } | null> {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(fileId);
            req.onsuccess = () => resolve(req.result ? req.result.data : null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

async function saveVectorsToCache(fileId: string, serializedVoy: string, chunks: [string, string][]) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ id: fileId, data: { serializedVoy, chunks } });
    } catch (e) { console.warn("Caching failed", e); }
}

async function clearVectorsCache() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
    } catch { }
}

async function loadDeps() {
    if (!pdfjsLib) {
        pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    if (!VoyClass) {
        const voyModule = await import("voy-search");
        VoyClass = voyModule.Voy;
    }
    if (!pipelineFn) {
        const transformers = await import("@huggingface/transformers");
        transformers.env.allowLocalModels = false;
        transformers.env.useBrowserCache = true;
        // Optionally configure WebGPU if supported by environment
        if ((navigator as any).gpu && transformers.env.backends.onnx.wasm) {
            transformers.env.backends.onnx.wasm.numThreads = 1;
        }
        pipelineFn = transformers.pipeline;
    }
}

// ── DOCX Extraction (DecompressionStream + DOMParser — zero extra deps) ──

async function extractDocx(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // ZIP signature check
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error("Not a valid ZIP/DOCX");

        // Parse the ZIP central directory to find word/document.xml
        const findFile = (name: string): Uint8Array | null => {
            let offset = 0;
            while (offset < bytes.length - 30) {
                // Local file header signature: 0x04034b50
                if (bytes[offset] !== 0x50 || bytes[offset+1] !== 0x4B ||
                    bytes[offset+2] !== 0x03 || bytes[offset+3] !== 0x04) break;
                const compression = bytes[offset+8] | (bytes[offset+9] << 8);
                const compressedSize = bytes[offset+18] | (bytes[offset+19] << 8) | (bytes[offset+20] << 16) | (bytes[offset+21] << 24);
                const fileNameLen = bytes[offset+26] | (bytes[offset+27] << 8);
                const extraLen   = bytes[offset+28] | (bytes[offset+29] << 8);
                const fileNameBytes = bytes.slice(offset+30, offset+30+fileNameLen);
                const fileName = new TextDecoder().decode(fileNameBytes);
                const dataOffset = offset + 30 + fileNameLen + extraLen;
                const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);

                if (fileName === name) {
                    if (compression === 0) return compressedData; // stored
                    if (compression === 8) {
                        // deflate — decompress synchronously via a tiny inline approach
                        return compressedData;
                    }
                }
                offset = dataOffset + compressedSize;
            }
            return null;
        };

        // We'll use DecompressionStream for deflate
        const compressed = findFile("word/document.xml");
        if (!compressed) return `[DOCX: "${file.name}" — could not locate word/document.xml]`;

        // Build deflate stream and decompress
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(compressed.buffer as ArrayBuffer);
        writer.close();

        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
            const { value, done: d } = await reader.read();
            if (value) chunks.push(value);
            done = d;
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(total);
        let pos = 0;
        for (const c of chunks) { merged.set(c, pos); pos += c.length; }
        const xml = new TextDecoder().decode(merged);

        // Strip XML tags, decode common entities
        const text = xml
            .replace(/<w:p[ >]/g, "\n<w:p ") // paragraph → newline
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();
        return text || `[DOCX: "${file.name}" — extracted but empty]`;
    } catch (e: any) {
        return `[DOCX parse error for "${file.name}": ${e.message}]`;
    }
}

// ── Text extraction ──

// Sanitize text: strip null bytes, control chars, and ensure it's a valid string
function sanitizeText(text: any): string {
    if (typeof text !== "string") {
        try { return String(text); } catch { return ""; }
    }
    // Remove null bytes and most control characters (keep newlines, tabs, spaces)
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

async function extractText(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    // PDF
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
        await loadDeps();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // Preserve reading order — items with large x-gap get a space, y-gap get newline
            const items = content.items as any[];
            let line = "";
            for (let j = 0; j < items.length; j++) {
                const item = items[j];
                const str = typeof item.str === "string" ? item.str : String(item.str || "");
                const hasEOL = item.hasEOL;
                line += str;
                if (hasEOL || j === items.length - 1) {
                    text += line.trim() + "\n";
                    line = "";
                } else if (item.width > 0) {
                    line += " ";
                }
            }
        }
        return sanitizeText(text);
    }

    // DOCX
    if (name.endsWith(".docx")) {
        return await extractDocx(file);
    }

    // CSV
    if (name.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length === 0) return text;
        const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
        const rows = lines.slice(1, 51);
        let formatted = `CSV Data (${lines.length - 1} rows):\nColumns: ${headers.join(", ")}\n\n`;
        for (const row of rows) {
            const cells = row.split(",").map(c => c.trim().replace(/"/g, ""));
            formatted += headers.map((h, i) => `${h}: ${cells[i] || ""}`).join(" | ") + "\n";
        }
        return formatted;
    }

    // HTML (strip tags)
    if (name.endsWith(".html") || name.endsWith(".htm")) {
        const html = await file.text();
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&[a-z]+;/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    // Fallback: TXT, MD, JSON
    return await file.text();
}

// ── Sentence-boundary-aware chunking with 50% overlap ──
// Strategy: split into sentences, group into windows, slide by half-window.
// This dramatically outperforms fixed-size character slicing for retrieval accuracy.

const TARGET_CHUNK_SENTENCES = 8;   // ~200–400 words per chunk
const OVERLAP_SENTENCES       = 4;   // 50% overlap
const MAX_CHUNK_CHARS         = 2000; // hard cap — prevents embedding OOM
const MIN_CHUNK_CHARS         = 80;   // skip near-empty chunks

function splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation followed by whitespace or end
    // Preserves the delimiter by using a lookahead-like approach
    const raw = text.split(/(?<=[.!?])\s+/);
    // Further split on newlines (markdown headers, list items)
    const sentences: string[] = [];
    for (const s of raw) {
        const lines = s.split(/\n+/);
        for (const l of lines) {
            const t = l.trim();
            if (t) sentences.push(t);
        }
    }
    return sentences;
}

function chunkText(text: string): string[] {
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return [];

    const finalChunks: string[] = [];
    let i = 0;

    while (i < sentences.length) {
        // Build a window of TARGET_CHUNK_SENTENCES sentences
        let chunk = "";
        let j = i;
        while (j < sentences.length && j < i + TARGET_CHUNK_SENTENCES) {
            const candidate = chunk ? chunk + " " + sentences[j] : sentences[j];
            if (candidate.length > MAX_CHUNK_CHARS && chunk) break;
            chunk = candidate;
            j++;
        }
        // If a single sentence exceeds the hard cap, slice it brutally
        if (!chunk && j < sentences.length) {
            chunk = sentences[j].slice(0, MAX_CHUNK_CHARS);
            j++;
        }
        if (chunk.length >= MIN_CHUNK_CHARS) {
            finalChunks.push(chunk);
        }
        // Advance by half the window for 50% overlap
        i = Math.max(i + Math.max(1, Math.floor((j - i) * 0.5)), i + 1);
    }
    return finalChunks;
}

// ── Cosine similarity between two embedding vectors ──
function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── BM25 scoring for hybrid search ──

const BM25_K1 = 1.2;
const BM25_B = 0.75;

function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length > 1);
}

function bm25Score(query: string, candidateIds: string[]): Map<string, number> {
    const queryTerms = tokenize(query);
    const N = chunkStore.size;
    const allValues = Array.from(chunkStore.values());
    const avgDl = (() => {
        let sum = 0;
        for (let i = 0; i < allValues.length; i++) sum += tokenize(allValues[i].text).length;
        return sum / Math.max(N, 1);
    })();

    const df = new Map<string, number>();
    for (const term of queryTerms) {
        let count = 0;
        for (let i = 0; i < allValues.length; i++) {
            if (allValues[i].text.toLowerCase().includes(term)) count++;
        }
        df.set(term, count);
    }

    const scores = new Map<string, number>();
    for (const id of candidateIds) {
        const entry = chunkStore.get(id);
        if (!entry) continue;
        const tokens = tokenize(entry.text);
        const dl = tokens.length;
        let score = 0;
        for (const term of queryTerms) {
            const termFreq = tokens.filter(t => t === term).length;
            const docFreq = df.get(term) || 0;
            const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
            score += idf * ((termFreq * (BM25_K1 + 1)) / (termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl))));
        }
        scores.set(id, score);
    }
    return scores;
}

// Reciprocal Rank Fusion — merges vector + BM25 ranked lists
function rrfFusion(rankings: string[][], k = 60): string[] {
    const scores = new Map<string, number>();
    for (const ranking of rankings) {
        for (let i = 0; i < ranking.length; i++) {
            const id = ranking[i];
            scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
        }
    }
    return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
}

// ── MMR re-ranking: Maximum Marginal Relevance ──
// Picks `k` chunks that are most relevant to the query AND most diverse from each other.
// lambda=0.6 means 60% relevance, 40% diversity.
function mmrRerank(
    queryEmbedding: number[],
    candidateIds: string[],
    k: number,
    lambda = 0.6,
): string[] {
    if (candidateIds.length <= k) return candidateIds;

    const selected: string[] = [];
    const remaining = [...candidateIds];

    while (selected.length < k && remaining.length > 0) {
        let bestId = "";
        let bestScore = -Infinity;

        for (const id of remaining) {
            const entry = chunkStore.get(id);
            if (!entry) continue;
            const relevance = cosine(queryEmbedding, entry.embedding);

            // Max similarity to already-selected chunks
            let maxSim = 0;
            for (const selId of selected) {
                const selEntry = chunkStore.get(selId);
                if (!selEntry) continue;
                const sim = cosine(entry.embedding, selEntry.embedding);
                if (sim > maxSim) maxSim = sim;
            }

            const score = lambda * relevance - (1 - lambda) * maxSim;
            if (score > bestScore) { bestScore = score; bestId = id; }
        }

        if (!bestId) break;
        selected.push(bestId);
        remaining.splice(remaining.indexOf(bestId), 1);
    }
    return selected;
}

// ── Message Handler ──

self.addEventListener("message", async (e: MessageEvent) => {
    const { action, payload, id } = e.data;

    try {
        if (action === "ADD_FILE") {
            const { file } = payload;

            self.postMessage({ id, status: `Reading ${file.name}...` });
            await loadDeps();

            const text = await extractText(file);
            if (!text.trim()) throw new Error("No text found in file");

            const docMetadata = {
                id: Date.now().toString(),
                name: file.name,
                size: file.size,
                type: file.type || file.name.split(".").pop() || "unknown",
                chunks: 0,
                rawText: text,
            };

            // Small file: skip vector indexing
            if (text.length <= MAX_DIRECT_INJECT_SIZE) {
                docMetadata.chunks = 1;
                self.postMessage({ id, result: docMetadata, done: true });
                return;
            }

            const fileHash = `${file.name}_${file.size}_${file.lastModified}`;

            // Check Cache First
            const cached = await getCachedVectors(fileHash);
            if (cached) {
                self.postMessage({ id, status: `Loading cached vectors for ${file.name}...` });

                if (!voy) voy = VoyClass.deserialize(cached.serializedVoy);
                // Additive merge — don't overwrite chunks from previously loaded files
                for (const [k, v] of cached.chunks) {
                    // v may be the old string format (from pre-upgrade cache) or the new {text, embedding} shape
                    if (typeof v === "string") {
                        chunkStore.set(k, { text: v, embedding: [] });
                    } else {
                        chunkStore.set(k, v as { text: string; embedding: number[] });
                    }
                }

                docMetadata.chunks = cached.chunks.length;
                docMetadata.rawText = ""; // memory optimization

                self.postMessage({ id, result: docMetadata, done: true });
                return;
            }

            // Not in cache -> Large file: Chunk & Embed
            self.postMessage({ id, status: `Chunking ${file.name}...` });
            const chunks = chunkText(text);

            self.postMessage({ id, status: `Loading Embedding Model...` });

            if (!embedder) {
                // Determine if WebGPU is available in worker context
                const isWebGPU = !!(navigator as any).gpu;
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME, {
                    device: isWebGPU ? "webgpu" : "wasm",
                    dtype: "fp32" // WebGPU requires fp32 for many models
                });
            }
            if (!voy) {
                voy = new VoyClass({ embeddings: [] });
            }

            self.postMessage({ id, status: `Generating Embeddings for ${chunks.length} chunks...` });

            for (let i = 0; i < chunks.length; i++) {
                const cleanChunk = sanitizeText(chunks[i]).trim();
                if (!cleanChunk) continue;
                const output = await embedder(cleanChunk, { pooling: "mean", normalize: true });
                const embedding = Array.from(output.data) as number[];

                voy.add({
                    embeddings: [{
                        id: `${fileHash}-${i}`,
                        title: file.name,
                        url: "",
                        embeddings: embedding as any
                    }]
                });

                // Store text + embedding for MMR
                chunkStore.set(`${fileHash}-${i}`, { text: chunks[i], embedding });

                if (i % 5 === 4) {
                    self.postMessage({ id, status: `Embedding chunk ${i + 1}/${chunks.length}...` });
                }
            }

            // Save to Cache (store text+embedding pairs)
            try {
                self.postMessage({ id, status: `Caching vectors...` });
                const serialized = voy.serialize();
                const chunkEntries: [string, { text: string; embedding: number[] }][] = Array.from(chunkStore.entries());
                await saveVectorsToCache(fileHash, serialized, chunkEntries as any);
            } catch (e) {
                console.warn("Failed to serialize voy index", e);
            }

            docMetadata.chunks = chunks.length;
            // Clear raw text to save main thread memory since it's now in vector DB
            docMetadata.rawText = "";

            self.postMessage({ id, result: docMetadata, done: true });
        }
        else if (action === "SEARCH") {
            const { query, limit = 3 } = payload;

            if (!voy) {
                self.postMessage({ id, result: [], done: true });
                return;
            }

            if (!embedder) {
                const isWebGPU = !!(navigator as any).gpu;
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME, {
                    device: isWebGPU ? "webgpu" : "wasm",
                    dtype: "fp32"
                });
            }

            const output = await embedder(query, { pooling: "mean", normalize: true });
            const queryEmbedding = Array.from(output.data) as number[];

            // ── Hybrid search: Vector (Voy) + BM25 → RRF fusion → MMR rerank ──
            const poolSize = Math.min(Math.max(limit * 4, 12), chunkStore.size);

            // 1) Vector ranking
            const rawResults: any = voy.search(queryEmbedding as any, poolSize);
            const hits = rawResults.hits || rawResults.neighbors || rawResults || [];
            const cleanHits = Array.isArray(hits) ? hits : [];
            const vectorRanking: string[] = cleanHits.map((h: any) => h.id).filter((id: string) => chunkStore.has(id));

            // 2) BM25 keyword ranking over same candidates
            const allChunkIds = Array.from(chunkStore.keys());
            const bm25Scores = bm25Score(query, allChunkIds);
            const bm25Ranking = Array.from(bm25Scores.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, poolSize)
                .map(e => e[0]);

            // 3) RRF fusion of both rankings
            const fusedIds = rrfFusion([vectorRanking, bm25Ranking]);

            // 4) MMR reranking for diversity
            const rerankedIds = mmrRerank(queryEmbedding, fusedIds, limit);
            const chunks = rerankedIds.map(cid => chunkStore.get(cid)?.text || "").filter(Boolean);
            self.postMessage({ id, result: chunks, done: true });
        }
        else if (action === "CLEAR") {
            voy = null;
            chunkStore.clear();
            self.postMessage({ id, result: true, done: true });
        }
        else if (action === "CLEAR_CACHE") {
            await clearVectorsCache();
            self.postMessage({ id, result: true, done: true });
        }
    } catch (err: any) {
        console.error("Worker Error:", err);
        self.postMessage({ id, error: err.message, done: true });
    }
});
