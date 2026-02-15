"use client";

import { create } from "zustand";

interface RAGDocument {
    id: string;
    name: string;
    size: number;
    type: string;
    chunks: number;
    rawText: string; // Store full raw text for direct injection
}

interface RAGState {
    documents: RAGDocument[];
    isIndexing: boolean;
    status: string;
    ragEnabled: boolean;
    pendingFiles: RAGDocument[]; // Files attached but not yet sent

    // Actions
    addFile: (file: File) => Promise<void>;
    search: (query: string, limit?: number) => Promise<string[]>;
    getFileContext: (query: string) => Promise<string>;
    clear: () => void;
    clearPending: () => void;
    toggle: () => void;
}

// Module-level instances (lazy-loaded)
let voy: any = null;
let embedder: any = null;
let VoyClass: any = null;
let pipelineFn: any = null;
let pdfjsLib: any = null;
const RESOURCE_NAME = "Xenova/all-MiniLM-L6-v2";
const chunkStore = new Map<string, string>();

// Lazy-load browser-only dependencies
async function loadDeps() {
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
    if (!pdfjsLib) {
        pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }
}

// ── Text extraction for multiple file types ──

const extractText = async (file: File): Promise<string> => {
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

    // DOCX (it's a ZIP of XML files)
    if (name.endsWith(".docx")) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer]);
            // Simple DOCX text extraction: read the XML and strip tags
            const text = await blob.text();
            // Extract text between <w:t> tags (Word XML format)
            const matches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
            if (matches) {
                return matches
                    .map(m => m.replace(/<[^>]+>/g, ""))
                    .join(" ")
                    .replace(/\s+/g, " ");
            }
            // Fallback: strip all XML tags
            return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        } catch {
            return await file.text();
        }
    }

    // CSV
    if (name.endsWith(".csv")) {
        const text = await file.text();
        // Convert CSV to readable format
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

    // TXT, MD, JSON, and everything else
    return await file.text();
};

const chunkText = (text: string, chunkSize: number = 500, overlap: number = 50): string[] => {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }
    return chunks;
};

const MAX_DIRECT_INJECT_SIZE = 8000; // ~8KB = inject full text directly

export const useRAG = create<RAGState>((set, get) => ({
    documents: [],
    isIndexing: false,
    status: "ready",
    ragEnabled: false,
    pendingFiles: [],

    addFile: async (file: File) => {
        try {
            set({ isIndexing: true, status: `Reading ${file.name}...` });

            // Lazy-load browser-only deps
            await loadDeps();

            // 1. Extract Text
            const text = await extractText(file);
            if (!text.trim()) throw new Error("No text found in file");

            // Store document metadata with raw text
            const newDoc: RAGDocument = {
                id: Date.now().toString(),
                name: file.name,
                size: file.size,
                type: file.type || file.name.split(".").pop() || "unknown",
                chunks: 0,
                rawText: text,
            };

            // 2. For small files, skip vector indexing — we'll inject raw text directly
            if (text.length <= MAX_DIRECT_INJECT_SIZE) {
                newDoc.chunks = 1; // Single "chunk" = the whole file
                set(state => ({
                    documents: [...state.documents, newDoc],
                    pendingFiles: [...state.pendingFiles, newDoc],
                    isIndexing: false,
                    ragEnabled: true,
                    status: "ready",
                }));
                return;
            }

            // 3. For larger files, chunk and embed for vector search
            set({ status: `Chunking ${file.name}...` });
            const chunks = chunkText(text);

            set({ status: `Loading Embedding Model...` });
            if (!embedder) {
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME);
            }

            if (!voy) {
                voy = new VoyClass({ embeddings: [] });
            }

            set({ status: `Generating Embeddings for ${chunks.length} chunks...` });

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
                    set({ status: `Embedding chunk ${i + 1}/${chunks.length}...` });
                    await new Promise(r => requestAnimationFrame(r));
                }
            }

            newDoc.chunks = chunks.length;

            set(state => ({
                documents: [...state.documents, newDoc],
                pendingFiles: [...state.pendingFiles, newDoc],
                isIndexing: false,
                ragEnabled: true,
                status: "ready",
            }));

        } catch (e: any) {
            console.error(e);
            set({ status: `Error: ${e.message}`, isIndexing: false });
        }
    },

    search: async (query: string, limit: number = 3) => {
        if (!voy || !embedder) return [];

        const output = await embedder(query, { pooling: "mean", normalize: true });
        const queryEmbedding = Array.from(output.data);
        const results: any = voy.search(queryEmbedding as any, limit);
        const hits = results.hits || results;

        return hits.map((hit: any) => {
            return chunkStore.get(hit.id) || "";
        });
    },

    // Smart context builder: raw text for small files, vector search for large
    getFileContext: async (query: string) => {
        const { documents } = get();
        if (documents.length === 0) return "";

        const parts: string[] = [];

        for (const doc of documents) {
            if (doc.rawText.length <= MAX_DIRECT_INJECT_SIZE) {
                // Small file: inject full text
                parts.push(`📎 File: "${doc.name}" (${doc.type})\n---\n${doc.rawText}\n---`);
            }
        }

        // For large files, do vector search
        const hasLargeFiles = documents.some(d => d.rawText.length > MAX_DIRECT_INJECT_SIZE);
        if (hasLargeFiles) {
            try {
                const chunks = await get().search(query, 4);
                const relevantChunks = chunks.filter(c => c && c.trim().length > 20);
                if (relevantChunks.length > 0) {
                    parts.push(
                        `📎 Relevant excerpts from uploaded documents:\n---\n${relevantChunks.map((c, i) => `[Excerpt ${i + 1}] ${c.trim()}`).join("\n\n")}\n---`
                    );
                }
            } catch (e) {
                console.error("RAG search failed:", e);
            }
        }

        return parts.join("\n\n");
    },

    clear: () => {
        voy = null;
        chunkStore.clear();
        set({ documents: [], pendingFiles: [], status: "ready" });
    },

    clearPending: () => {
        set({ pendingFiles: [] });
    },

    toggle: () => set(state => ({ ragEnabled: !state.ragEnabled }))
}));
