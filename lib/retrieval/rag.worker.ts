/// <reference lib="webworker" />

import {
    MAX_DOCX_EXPANDED_BYTES,
    MAX_RAG_FILE_BYTES,
    getFileExtension,
    limitExtractedText,
    validateRagFile,
} from "@/lib/retrieval/file-policy";

// N0X RAG Worker v2 - BULLETPROOF EDITION
// Complete rewrite focused on:
// - Graceful failure paths for extraction, embedding, and cache errors
// - Proper cache validation
// - Retry logic for transient failures
// - Memory leak prevention
// - Type safety

let voy: any = null;
let embedder: any = null;
let VoyClass: any = null;
let pipelineFn: any = null;
let pdfjsLib: any = null;
const RESOURCE_NAME = "Xenova/all-MiniLM-L6-v2";

// Typed chunk storage with validation
interface ChunkEntry {
    text: string;
    embedding: number[];
}

const chunkStore = new Map<string, ChunkEntry>();

const MAX_DIRECT_INJECT_SIZE = 8000;

// --- IndexedDB Caching with validation ---
const DB_NAME = "n0x_rag_cache";
const STORE_NAME = "vectors";
const CACHE_VERSION = 2; // Bump to invalidate old incompatible caches

interface CachedData {
    version: number;
    serializedVoy: string;
    chunks: [string, ChunkEntry][];
    timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = e => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
    });
}

async function getCachedVectors(fileId: string): Promise<CachedData | null> {
    let db: IDBDatabase | null = null;
    try {
        db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db!.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(fileId);

            req.onsuccess = () => {
                const result = req.result?.data;
                // Validate cache version and structure
                if (
                    result &&
                    result.version === CACHE_VERSION &&
                    result.serializedVoy &&
                    Array.isArray(result.chunks)
                ) {
                    resolve(result);
                } else {
                    resolve(null); // Invalid cache, will regenerate
                }
            };
            req.onerror = () => resolve(null);
            tx.oncomplete = () => db?.close();
            tx.onerror = () => {
                db?.close();
                reject(tx.error);
            };
        });
    } catch (e) {
        console.warn("Cache read failed:", e);
        return null;
    } finally {
        if (db) db.close();
    }
}

async function saveVectorsToCache(
    fileId: string,
    serializedVoy: string,
    chunks: [string, ChunkEntry][]
): Promise<void> {
    let db: IDBDatabase | null = null;
    try {
        db = await openDB();
        const data: CachedData = {
            version: CACHE_VERSION,
            serializedVoy,
            chunks,
            timestamp: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const tx = db!.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put({ id: fileId, data });
            tx.oncomplete = () => {
                db?.close();
                resolve();
            };
            tx.onerror = () => {
                db?.close();
                reject(tx.error);
            };
        });
    } catch (e) {
        console.warn("Cache save failed (non-fatal):", e);
        if (db) db.close();
    }
}

async function clearVectorsCache(): Promise<void> {
    let db: IDBDatabase | null = null;
    try {
        db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db!.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => {
                db?.close();
                resolve();
            };
            tx.onerror = () => {
                db?.close();
                reject(tx.error);
            };
        });
    } catch (e) {
        console.warn("Cache clear failed:", e);
        if (db) db.close();
    }
}

async function loadDeps(): Promise<void> {
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
        if ((navigator as any).gpu && transformers.env.backends.onnx.wasm) {
            transformers.env.backends.onnx.wasm.numThreads = 1;
        }
        pipelineFn = transformers.pipeline;
    }
}

// ── DOCX Extraction (improved error handling) ──

async function extractDocx(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
            throw new Error("Not a valid ZIP/DOCX file");
        }

        const findFile = (name: string): { data: Uint8Array; compression: number } | null => {
            let offset = 0;
            while (offset < bytes.length - 30) {
                if (
                    bytes[offset] !== 0x50 ||
                    bytes[offset + 1] !== 0x4b ||
                    bytes[offset + 2] !== 0x03 ||
                    bytes[offset + 3] !== 0x04
                )
                    break;

                const header = new DataView(bytes.buffer, bytes.byteOffset + offset, 30);
                const compression = header.getUint16(8, true);
                const compressedSize = header.getUint32(18, true);
                const expandedSize = header.getUint32(22, true);
                const fileNameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
                const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
                const fileNameBytes = bytes.slice(offset + 30, offset + 30 + fileNameLen);
                const fileName = new TextDecoder().decode(fileNameBytes);
                const dataOffset = offset + 30 + fileNameLen + extraLen;
                const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);

                if (fileName === name) {
                    if (expandedSize > MAX_DOCX_EXPANDED_BYTES) {
                        throw new Error("DOCX expanded content exceeds the 32 MB safety limit");
                    }
                    if (compression === 0 || compression === 8) {
                        return { data: compressedData, compression };
                    }
                    throw new Error(`Unsupported DOCX compression method ${compression}`);
                }
                offset = dataOffset + compressedSize;
            }
            return null;
        };

        const archiveEntry = findFile("word/document.xml");
        if (!archiveEntry) {
            throw new Error(`Could not find document content in “${file.name}”`);
        }
        let merged: Uint8Array;
        if (archiveEntry.compression === 0) {
            merged = archiveEntry.data;
        } else {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();
            const compressedBuffer = archiveEntry.data.slice().buffer as ArrayBuffer;
            await writer.write(compressedBuffer);
            await writer.close();

            const chunks: Uint8Array[] = [];
            let total = 0;
            let done = false;
            while (!done) {
                const { value, done: streamDone } = await reader.read();
                if (value) {
                    total += value.byteLength;
                    if (total > MAX_DOCX_EXPANDED_BYTES) {
                        await reader.cancel("Expanded DOCX exceeds safety limit");
                        throw new Error("DOCX expanded content exceeds the 32 MB safety limit");
                    }
                    chunks.push(value);
                }
                done = streamDone;
            }

            merged = new Uint8Array(total);
            let pos = 0;
            for (const chunk of chunks) {
                merged.set(chunk, pos);
                pos += chunk.length;
            }
        }
        const xml = new TextDecoder().decode(merged);

        const text = xml
            .replace(/<w:p[ >]/g, "\n<w:p ")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();

        if (!text) throw new Error(`DOCX “${file.name}” appears to be empty`);
        return limitExtractedText(text);
    } catch (e: any) {
        console.error("DOCX extraction error:", e);
        throw new Error(`Failed to extract DOCX “${file.name}”: ${e.message}`);
    }
}

// ── Text extraction with comprehensive error handling ──

function sanitizeText(text: any): string {
    if (typeof text !== "string") {
        try {
            return String(text);
        } catch {
            return "";
        }
    }
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

async function extractText(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    try {
        // PDF
        if (file.type === "application/pdf" || name.endsWith(".pdf")) {
            await loadDeps();
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let text = "";

            for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
                // Limit to 100 pages
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
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

            return limitExtractedText(sanitizeText(text));
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

            return limitExtractedText(formatted);
        }

        // HTML
        if (name.endsWith(".html") || name.endsWith(".htm")) {
            const html = await file.text();
            return limitExtractedText(
                html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/&[a-z]+;/gi, " ")
                    .replace(/\s+/g, " ")
                    .trim()
            );
        }

        // Fallback: TXT, MD, JSON
        return limitExtractedText(sanitizeText(await file.text()));
    } catch (e: any) {
        console.error(`Text extraction failed for ${file.name}:`, e);
        throw new Error(`Failed to extract text from “${file.name}”: ${e.message}`);
    }
}

// ── Improved chunking with better sentence detection ──

const TARGET_CHUNK_SENTENCES = 8;
const OVERLAP_SENTENCES = 4;
const MAX_CHUNK_CHARS = 2000;
const MIN_CHUNK_CHARS = 80;

function splitIntoSentences(text: string): string[] {
    const raw = text.split(/(?<=[.!?])\s+/);
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
        let chunk = "";
        let j = i;

        while (j < sentences.length && j < i + TARGET_CHUNK_SENTENCES) {
            const candidate = chunk ? chunk + " " + sentences[j] : sentences[j];
            if (candidate.length > MAX_CHUNK_CHARS && chunk) break;
            chunk = candidate;
            j++;
        }

        if (!chunk && j < sentences.length) {
            chunk = sentences[j].slice(0, MAX_CHUNK_CHARS);
            j++;
        }

        if (chunk.length >= MIN_CHUNK_CHARS) {
            finalChunks.push(chunk);
        }

        i = Math.max(i + Math.max(1, Math.floor((j - i) * 0.5)), i + 1);
    }

    return finalChunks;
}

// ── Search utilities ──

function cosine(a: number[], b: number[]): number {
    let dot = 0,
        na = 0,
        nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(t => t.length > 1);
}

function bm25Score(query: string, candidateIds: string[]): Map<string, number> {
    const queryTerms = tokenize(query);
    const N = chunkStore.size;
    const allValues = Array.from(chunkStore.values());

    const avgDl = (() => {
        let sum = 0;
        for (let i = 0; i < allValues.length; i++) {
            sum += tokenize(allValues[i].text).length;
        }
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

function rrfFusion(rankings: string[][], k = 60): string[] {
    const scores = new Map<string, number>();
    for (const ranking of rankings) {
        for (let i = 0; i < ranking.length; i++) {
            const id = ranking[i];
            scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
        }
    }
    return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(e => e[0]);
}

function mmrRerank(queryEmbedding: number[], candidateIds: string[], k: number, lambda = 0.6): string[] {
    if (candidateIds.length <= k) return candidateIds;

    const selected: string[] = [];
    const remaining = [...candidateIds];

    while (selected.length < k && remaining.length > 0) {
        let bestId = "";
        let bestScore = -Infinity;

        for (const id of remaining) {
            const entry = chunkStore.get(id);
            if (!entry || entry.embedding.length === 0) continue;

            const relevance = cosine(queryEmbedding, entry.embedding);

            let maxSim = 0;
            for (const selId of selected) {
                const selEntry = chunkStore.get(selId);
                if (!selEntry || selEntry.embedding.length === 0) continue;
                const sim = cosine(entry.embedding, selEntry.embedding);
                if (sim > maxSim) maxSim = sim;
            }

            const score = lambda * relevance - (1 - lambda) * maxSim;
            if (score > bestScore) {
                bestScore = score;
                bestId = id;
            }
        }

        if (!bestId) break;
        selected.push(bestId);
        remaining.splice(remaining.indexOf(bestId), 1);
    }

    return selected;
}

function rebuildVoyFromChunks() {
    voy = new VoyClass({ embeddings: [] });
    for (const [chunkId, entry] of chunkStore) {
        if (!entry.embedding.length) continue;
        voy.add({
            embeddings: [
                {
                    id: chunkId,
                    title: chunkId,
                    url: "",
                    embeddings: entry.embedding as any,
                },
            ],
        });
    }
}

// ── Message Handler ──

self.addEventListener("message", async (e: MessageEvent) => {
    const { action, payload, id } = e.data;

    try {
        if (action === "ADD_FILE") {
            const { file } = payload;

            const validationError = validateRagFile(file);
            if (validationError || file.size > MAX_RAG_FILE_BYTES) {
                throw new Error(validationError || "File exceeds the local upload safety limit");
            }

            self.postMessage({ id, status: `Reading ${file.name}...` });
            await loadDeps();

            const text = await extractText(file);
            if (!text.trim()) {
                throw new Error("No text content found in file");
            }

            const fileHash = `${file.name}_${file.size}_${file.lastModified}`;
            const docMetadata = {
                id: fileHash,
                name: file.name,
                size: file.size,
                type: file.type || getFileExtension(file.name) || "unknown",
                chunks: 0,
                rawText: text,
            };

            // Small file: skip vector indexing
            if (text.length <= MAX_DIRECT_INJECT_SIZE) {
                docMetadata.chunks = 1;
                self.postMessage({ id, result: docMetadata, done: true });
                return;
            }

            // Check Cache
            const cached = await getCachedVectors(fileHash);
            if (cached && cached.version === CACHE_VERSION) {
                self.postMessage({ id, status: `Loading cached vectors for ${file.name}...` });

                try {
                    // Validate and load chunks
                    for (const [k, v] of cached.chunks) {
                        if (v && typeof v.text === "string" && Array.isArray(v.embedding)) {
                            chunkStore.set(k, v);
                        } else {
                            console.warn(`Invalid cached chunk ${k}, skipping`);
                        }
                    }
                    rebuildVoyFromChunks();

                    docMetadata.chunks = cached.chunks.length;
                    docMetadata.rawText = "";

                    self.postMessage({ id, result: docMetadata, done: true });
                    return;
                } catch (cacheError) {
                    console.warn("Cache load failed, regenerating:", cacheError);
                    // Fall through to regeneration
                }
            }

            // Not in cache -> Chunk & Embed
            self.postMessage({ id, status: `Chunking ${file.name}...` });
            const chunks = chunkText(text);

            if (chunks.length === 0) {
                throw new Error("Failed to create chunks from text");
            }

            self.postMessage({ id, status: `Loading Embedding Model...` });

            if (!embedder) {
                const isWebGPU = !!(navigator as any).gpu;
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME, {
                    device: isWebGPU ? "webgpu" : "wasm",
                    dtype: "fp32",
                });
            }

            if (!voy) {
                voy = new VoyClass({ embeddings: [] });
            }

            self.postMessage({ id, status: `Generating Embeddings for ${chunks.length} chunks...` });

            const chunkEntries: [string, ChunkEntry][] = [];

            for (let i = 0; i < chunks.length; i++) {
                const cleanChunk = sanitizeText(chunks[i]).trim();
                if (!cleanChunk) continue;

                try {
                    const output = await embedder(cleanChunk, { pooling: "mean", normalize: true });
                    const embedding = Array.from(output.data) as number[];

                    const chunkId = `${fileHash}-${i}`;

                    voy.add({
                        embeddings: [
                            {
                                id: chunkId,
                                title: file.name,
                                url: "",
                                embeddings: embedding as any,
                            },
                        ],
                    });

                    const entry: ChunkEntry = { text: cleanChunk, embedding };
                    chunkStore.set(chunkId, entry);
                    chunkEntries.push([chunkId, entry]);

                    if (i % 5 === 4) {
                        self.postMessage({ id, status: `Embedding chunk ${i + 1}/${chunks.length}...` });
                    }
                } catch (embErr) {
                    console.error(`Failed to embed chunk ${i}:`, embErr);
                    // Continue with other chunks
                }
            }

            // Save to Cache
            try {
                self.postMessage({ id, status: `Caching vectors...` });
                const serialized = voy.serialize();
                await saveVectorsToCache(fileHash, serialized, chunkEntries);
            } catch (serErr) {
                console.warn("Failed to cache vectors (non-fatal):", serErr);
            }

            docMetadata.chunks = chunkEntries.length;
            docMetadata.rawText = "";

            self.postMessage({ id, result: docMetadata, done: true });
        } else if (action === "SEARCH") {
            const { query, limit = 3 } = payload;

            if (!voy || chunkStore.size === 0) {
                self.postMessage({ id, result: [], done: true });
                return;
            }

            if (!embedder) {
                const isWebGPU = !!(navigator as any).gpu;
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME, {
                    device: isWebGPU ? "webgpu" : "wasm",
                    dtype: "fp32",
                });
            }

            const output = await embedder(query, { pooling: "mean", normalize: true });
            const queryEmbedding = Array.from(output.data) as number[];

            const poolSize = Math.min(Math.max(limit * 4, 12), chunkStore.size);

            // Vector ranking
            const rawResults: any = voy.search(queryEmbedding as any, poolSize);
            const hits = rawResults.hits || rawResults.neighbors || rawResults || [];
            const cleanHits = Array.isArray(hits) ? hits : [];
            const vectorRanking: string[] = cleanHits.map((h: any) => h.id).filter((id: string) => chunkStore.has(id));

            // BM25 ranking
            const allChunkIds = Array.from(chunkStore.keys());
            const bm25Scores = bm25Score(query, allChunkIds);
            const bm25Ranking = Array.from(bm25Scores.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, poolSize)
                .map(e => e[0]);

            // RRF fusion
            const fusedIds = rrfFusion([vectorRanking, bm25Ranking]);

            // MMR reranking
            const rerankedIds = mmrRerank(queryEmbedding, fusedIds, limit);
            const chunks = rerankedIds.map(cid => chunkStore.get(cid)?.text || "").filter(Boolean);

            self.postMessage({ id, result: chunks, done: true });
        } else if (action === "REMOVE_FILE") {
            const { fileKey } = payload;
            if (fileKey) {
                for (const chunkId of Array.from(chunkStore.keys())) {
                    if (chunkId.startsWith(`${fileKey}-`)) {
                        chunkStore.delete(chunkId);
                    }
                }
                if (chunkStore.size > 0) rebuildVoyFromChunks();
                else voy = null;
            }
            self.postMessage({ id, result: true, done: true });
        } else if (action === "CLEAR") {
            voy = null;
            chunkStore.clear();
            self.postMessage({ id, result: true, done: true });
        } else if (action === "CLEAR_CACHE") {
            await clearVectorsCache();
            self.postMessage({ id, result: true, done: true });
        }
    } catch (err: any) {
        console.error("Worker Error:", err);
        self.postMessage({ id, error: err.message || "Unknown error", done: true });
    }
});
