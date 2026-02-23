/// <reference lib="webworker" />

// We need to import the dependencies dynamically because Next.js webpack
// handles worker bundling slightly differently when using external pure-ESM or WASM modules.

let voy: any = null;
let embedder: any = null;
let VoyClass: any = null;
let pipelineFn: any = null;
let pdfjsLib: any = null;
const RESOURCE_NAME = "Xenova/all-MiniLM-L6-v2";
const chunkStore = new Map<string, string>();

const MAX_DIRECT_INJECT_SIZE = 8000; // ~8KB = inject full text directly

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
        const transformers = await import("@xenova/transformers");
        transformers.env.allowLocalModels = false;
        transformers.env.useBrowserCache = true;
        pipelineFn = transformers.pipeline;
    }
}

// ── Text extraction ──

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
            text += content.items.map((item: any) => item.str).join(" ") + "\n";
        }
        return text;
    }

    // DOCX (ZIP XML extraction)
    if (name.endsWith(".docx")) {
        try {
            const text = await file.text();
            const matches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
            if (matches) {
                return matches.map(m => m.replace(/<[^>]+>/g, "")).join(" ").replace(/\s+/g, " ");
            }
            return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        } catch {
            return await file.text();
        }
    }

    // CSV
    if (name.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length === 0) return text;

        const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
        const rows = lines.slice(1, 51); // Cap at 50 rows for context

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

// ── Semantic Chunking ──
function chunkText(text: string): string[] {
    const chunks: string[] = [];
    const maxTokensApprox = 400; // ~1600 characters max per chunk for better embedding coherence
    const minTokensApprox = 50;  // Don't create chunks smaller than ~200 chars if we can avoid it

    // 1. Try to split by Markdown Headers (#)
    const headerSplit = text.split(/\n#+\s+/);

    for (const section of headerSplit) {
        if (section.length < maxTokensApprox * 4) {
            chunks.push(section);
            continue;
        }

        // 2. If section is too big, split by paragraphs
        const paragraphSplit = section.split(/\n\n+/);
        let currentChunk = "";

        for (const para of paragraphSplit) {
            if (currentChunk.length + para.length > maxTokensApprox * 4 && currentChunk.length > minTokensApprox * 4) {
                chunks.push(currentChunk);
                currentChunk = para;
            } else {
                currentChunk += (currentChunk ? "\n\n" : "") + para;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
    }

    // 3. Fallback: if any chunk is STILL too big, slice it brutally
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
        if (chunk.length > maxTokensApprox * 5) {
            let start = 0;
            while (start < chunk.length) {
                const end = Math.min(start + (maxTokensApprox * 4), chunk.length);
                finalChunks.push(chunk.slice(start, end));
                start += (maxTokensApprox * 4) - 200; // 200 character overlap
            }
        } else if (chunk.trim()) {
            finalChunks.push(chunk);
        }
    }

    return finalChunks;
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

            // Large file: Chunk & Embed
            self.postMessage({ id, status: `Chunking ${file.name}...` });
            const chunks = chunkText(text);

            self.postMessage({ id, status: `Loading Embedding Model...` });

            if (!embedder) {
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME);
            }
            if (!voy) {
                voy = new VoyClass({ embeddings: [] });
            }

            self.postMessage({ id, status: `Generating Embeddings for ${chunks.length} chunks...` });

            for (let i = 0; i < chunks.length; i++) {
                const output = await embedder(chunks[i], { pooling: "mean", normalize: true });
                const embedding = Array.from(output.data);

                voy.add({
                    embeddings: [{
                        id: `${file.name}-${i}`,
                        title: file.name,
                        url: "",
                        embeddings: embedding as any
                    }]
                });

                chunkStore.set(`${file.name}-${i}`, chunks[i]);

                if (i % 5 === 4) {
                    self.postMessage({ id, status: `Embedding chunk ${i + 1}/${chunks.length}...` });
                }
            }

            docMetadata.chunks = chunks.length;
            // Clear raw text to save main thread memory since it's now in vector DB
            docMetadata.rawText = "";

            self.postMessage({ id, result: docMetadata, done: true });
        }
        else if (action === "SEARCH") {
            const { query, limit = 3 } = payload;

            if (!voy || !embedder) {
                self.postMessage({ id, result: [], done: true });
                return;
            }

            const output = await embedder(query, { pooling: "mean", normalize: true });
            const queryEmbedding = Array.from(output.data);
            const results: any = voy.search(queryEmbedding as any, limit);
            const hits = results.hits || results;

            const chunks = hits.map((hit: any) => chunkStore.get(hit.id) || "");
            self.postMessage({ id, result: chunks, done: true });
        }
        else if (action === "CLEAR") {
            voy = null;
            chunkStore.clear();
            self.postMessage({ id, result: true, done: true });
        }
    } catch (err: any) {
        console.error("Worker Error:", err);
        self.postMessage({ id, error: err.message, done: true });
    }
});
