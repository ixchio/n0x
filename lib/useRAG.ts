"use client";

import { create } from "zustand";

interface RAGDocument {
    id: string;
    name: string;
    size: number;
    type: string;
    chunks: number;
    rawText: string; // Store full raw text only for small files (direct injection)
}

interface RAGState {
    documents: RAGDocument[];
    isIndexing: boolean;
    status: string;
    ragEnabled: boolean;
    pendingFiles: RAGDocument[];

    // Actions
    addFile: (file: File) => Promise<void>;
    search: (query: string, limit?: number) => Promise<string[]>;
    getFileContext: (query: string) => Promise<string>;
    clear: () => void;
    clearPending: () => void;
    clearCache: () => Promise<void>;
    toggle: () => void;
}

const MAX_DIRECT_INJECT_SIZE = 8000;

// Singleton Worker interface
let ragWorker: Worker | null = null;
let msgIdCounter = 0;
const resolvers = new Map<number, { resolve: Function, reject: Function }>();

function getWorker(onStatus?: (status: string) => void): Worker {
    if (typeof window === "undefined") return null as any; // SSR guard

    if (!ragWorker) {
        ragWorker = new Worker(new URL("./rag.worker.ts", import.meta.url), { type: "module" });

        ragWorker.onmessage = (e) => {
            const { id, result, error, done, status } = e.data;

            if (status && window.__ON_RAG_STATUS) {
                window.__ON_RAG_STATUS(status);
            }

            if (done && resolvers.has(id)) {
                if (error) {
                    resolvers.get(id)!.reject(new Error(error));
                } else {
                    resolvers.get(id)!.resolve(result);
                }
                resolvers.delete(id);
            }
        };

        ragWorker.onerror = (e) => {
            console.error("Worker fatal error:", e);
        };
    }

    if (onStatus) {
        (window as any).__ON_RAG_STATUS = onStatus;
    }
    return ragWorker;
}

function postToWorker(action: string, payload: any, onStatus?: (s: string) => void): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = ++msgIdCounter;
        resolvers.set(id, { resolve, reject });
        const worker = getWorker(onStatus);
        if (!worker) {
            reject(new Error("Worker not available"));
            return;
        }
        worker.postMessage({ id, action, payload });
    });
}

export const useRAG = create<RAGState>((set, get) => ({
    documents: [],
    isIndexing: false,
    status: "ready",
    ragEnabled: false,
    pendingFiles: [],

    addFile: async (file: File) => {
        try {
            set({ isIndexing: true, status: `Initializing Worker for ${file.name}...` });

            const newDoc = await postToWorker("ADD_FILE", { file }, (status) => {
                set({ status });
            });

            set(state => ({
                documents: [...state.documents, newDoc],
                pendingFiles: [...state.pendingFiles, newDoc],
                isIndexing: false,
                ragEnabled: true,
                status: "ready",
            }));

        } catch (e: any) {
            console.error("RAG Worker Error:", e);
            set({ status: `Error: ${e.message}`, isIndexing: false });
            try {
                const fallbackText = (await file.text()).slice(0, 50000);
                const fallbackDoc: RAGDocument = {
                    id: Date.now().toString(),
                    name: file.name,
                    size: file.size,
                    type: file.type || file.name.split(".").pop() || "unknown",
                    chunks: 1,
                    rawText: fallbackText,
                };
                set(state => ({
                    documents: [...state.documents, fallbackDoc],
                    pendingFiles: [...state.pendingFiles, fallbackDoc],
                    isIndexing: false,
                    ragEnabled: true,
                    status: "ready",
                }));
            } catch (err) {

            }
        }
    },

    search: async (query: string, limit: number = 3) => {
        try {
            const chunks = await postToWorker("SEARCH", { query, limit });
            return chunks || [];
        } catch (e) {
            console.error("Worker search failed:", e);
            return [];
        }
    },

    getFileContext: async (query: string) => {
        const { documents } = get();
        if (documents.length === 0) return "";

        const parts: string[] = [];

        for (const doc of documents) {
            if (doc.rawText && doc.rawText.length > 0) {
                parts.push(`📎 File: "${doc.name}" (${doc.type})\n---\n${doc.rawText}\n---`);
            }
        }

        const hasLargeFiles = documents.some(d => !d.rawText && d.chunks > 0);
        if (hasLargeFiles) {
            try {
                const chunks = await get().search(query, 4);
                const relevantChunks = chunks.filter((c: string) => c && c.trim().length > 20);
                if (relevantChunks.length > 0) {
                    parts.push(
                        `📎 Relevant excerpts from uploaded documents:\n---\n${relevantChunks.map((c: string, i: number) => `[Excerpt ${i + 1}] ${c.trim()}`).join("\n\n")}\n---`
                    );
                }
            } catch (e) {
                console.error("RAG search failed:", e);
            }
        }

        return parts.join("\n\n");
    },

    clear: () => {
        postToWorker("CLEAR", {}).catch(() => { });
        set({ documents: [], pendingFiles: [], status: "ready" });
    },

    clearPending: () => {
        set({ pendingFiles: [] });
    },

    clearCache: async () => {
        try {
            await postToWorker("CLEAR_CACHE", {});
        } catch (e) {
            console.error(e);
        }
    },

    toggle: () => set(state => ({ ragEnabled: !state.ragEnabled }))
}));

declare global {
    interface Window {
        __ON_RAG_STATUS: (status: string) => void;
    }
}
