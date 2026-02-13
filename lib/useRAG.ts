"use client";

import { create } from "zustand";

interface RAGDocument {
    id: string;
    name: string;
    size: number;
    type: string;
    chunks: number;
}

interface RAGState {
    documents: RAGDocument[];
    isIndexing: boolean;
    status: string;
    ragEnabled: boolean;

    // Actions
    addFile: (file: File) => Promise<void>;
    search: (query: string, limit?: number) => Promise<string[]>;
    clear: () => void;
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

// Lazy-load browser-only dependencies (prevents SSR crashes)
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

const extractText = async (file: File): Promise<string> => {
    if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => item.str).join(" ") + "\n";
        }
        return text;
    } else {
        // TXT, MD, etc.
        return await file.text();
    }
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

export const useRAG = create<RAGState>((set, get) => ({
    documents: [],
    isIndexing: false,
    status: "ready",
    ragEnabled: false,

    addFile: async (file: File) => {
        try {
            set({ isIndexing: true, status: `Reading ${file.name}...` });

            // Lazy-load browser-only deps
            await loadDeps();

            // 1. Extract Text
            const text = await extractText(file);
            if (!text.trim()) throw new Error("No text found in file");

            set({ status: `Chunking ${file.name}...` });
            // 2. Chunk
            const chunks = chunkText(text);

            set({ status: `Loading Embedding Model...` });
            // 3. Load Embedder (Singleton)
            if (!embedder) {
                embedder = await pipelineFn("feature-extraction", RESOURCE_NAME);
            }

            // 4. Load Voy (Singleton)
            if (!voy) {
                voy = new VoyClass({
                    embeddings: []
                });
            }

            set({ status: `Generating Embeddings for ${chunks.length} chunks...` });

            // 5. Embed & Index (with UI-yielding pauses)
            for (let i = 0; i < chunks.length; i++) {
                const output = await embedder(chunks[i], { pooling: "mean", normalize: true });
                const embedding = Array.from(output.data);

                // Add to Voy
                voy.add({
                    embeddings: [{
                        id: `${file.name}-${i}`,
                        title: file.name,
                        url: "",
                        embeddings: embedding as any
                    }]
                });

                // Store chunk text in module-level Map
                chunkStore.set(`${file.name}-${i}`, chunks[i]);

                // Yield to main thread every 5 chunks to keep UI responsive
                if (i % 5 === 4) {
                    set({ status: `Embedding chunk ${i + 1}/${chunks.length}...` });
                    await new Promise(r => requestAnimationFrame(r));
                }
            }

            // Store document metadata
            const newDoc: RAGDocument = {
                id: Date.now().toString(),
                name: file.name,
                size: file.size,
                type: file.type,
                chunks: chunks.length
            };

            set(state => ({
                documents: [...state.documents, newDoc],
                isIndexing: false,
                status: "ready"
            }));

        } catch (e: any) {
            console.error(e);
            set({ status: `Error: ${e.message}`, isIndexing: false });
        }
    },

    search: async (query: string, limit: number = 3) => {
        if (!voy || !embedder) return [];

        // Embed query
        const output = await embedder(query, { pooling: "mean", normalize: true });
        const queryEmbedding = Array.from(output.data);

        // Search
        const results: any = voy.search(queryEmbedding as any, limit);

        const hits = results.hits || results;

        return hits.map((hit: any) => {
            return chunkStore.get(hit.id) || "";
        });
    },

    clear: () => {
        voy = null;
        chunkStore.clear();
        set({ documents: [], status: "ready" });
    },

    toggle: () => set(state => ({ ragEnabled: !state.ragEnabled }))
}));
