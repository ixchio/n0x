"use client";

import { create } from "zustand";
import { trackFunnelEvent } from "@/lib/analytics";

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
    removeFile: (id: string) => void;
    clear: () => void;
    clearPending: () => void;
    clearCache: () => Promise<void>;
    toggle: () => void;
}

const MAX_DIRECT_INJECT_SIZE = 8000;

// Singleton Worker interface
let ragWorker: Worker | null = null;
let msgIdCounter = 0;
const resolvers = new Map<number, { resolve: Function; reject: Function; timeout: ReturnType<typeof setTimeout> }>();

function getWorker(onStatus?: (status: string) => void): Worker {
    if (typeof window === "undefined") return null as any; // SSR guard

    if (!ragWorker) {
        ragWorker = new Worker(new URL("./rag.worker.ts", import.meta.url), { type: "module" });

        ragWorker.onmessage = e => {
            const { id, result, error, done, status } = e.data;

            if (status && window.__ON_RAG_STATUS) {
                window.__ON_RAG_STATUS(status);
            }

            if (resolvers.has(id)) {
                const pending = resolvers.get(id)!;
                if (error) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error(error));
                    resolvers.delete(id); // Delete immediately on error
                } else if (done) {
                    clearTimeout(pending.timeout);
                    pending.resolve(result);
                    resolvers.delete(id);
                }
            }
        };

        ragWorker.onerror = e => {
            console.error("Worker fatal error:", e);
            const error = new Error("Document worker crashed. Try a smaller file or clear the RAG cache.");
            for (const [id, pending] of resolvers) {
                clearTimeout(pending.timeout);
                pending.reject(error);
                resolvers.delete(id);
            }
            ragWorker?.terminate();
            ragWorker = null;
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
        const timeoutMs = action === "ADD_FILE" ? 300_000 : 60_000;
        const timeout = setTimeout(() => {
            resolvers.delete(id);
            reject(new Error(`${action} timed out. Try a smaller file or reload the app.`));
        }, timeoutMs);
        resolvers.set(id, { resolve, reject, timeout });
        const worker = getWorker(onStatus);
        if (!worker) {
            clearTimeout(timeout);
            resolvers.delete(id);
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
            trackFunnelEvent("document_uploaded", {
                type: file.type || file.name.split(".").pop()?.toLowerCase() || "unknown",
                sizeBucket: file.size < 1024 * 1024 ? "small" : file.size < 10 * 1024 * 1024 ? "medium" : "large",
            });
            set({ isIndexing: true, status: `Initializing Worker for ${file.name}...` });

            const newDoc = await postToWorker("ADD_FILE", { file }, status => {
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

            // Try fallback extraction
            try {
                set({ status: `Worker failed, trying fallback extraction...` });

                let fallbackText = "";
                const ext = file.name.split(".").pop()?.toLowerCase();
                const isBinary = [
                    "pdf",
                    "docx",
                    "xlsx",
                    "pptx",
                    "png",
                    "jpg",
                    "jpeg",
                    "gif",
                    "webp",
                    "zip",
                    "tar",
                    "gz",
                ].includes(ext || "");

                if (isBinary) {
                    fallbackText = `[Binary file: ${file.name}. Vector search unavailable, but file is attached to your messages for context.]`;
                } else {
                    try {
                        fallbackText = ((await file.text()) || "").slice(0, 50000);
                    } catch {
                        fallbackText = `[Could not read ${file.name}. File may be corrupted or in an unsupported format.]`;
                    }
                }

                if (!fallbackText.trim()) {
                    throw new Error("File appears to be empty");
                }

                const fallbackDoc: RAGDocument = {
                    id: Date.now().toString(),
                    name: file.name,
                    size: file.size,
                    type: file.type || ext || "unknown",
                    chunks: 1,
                    rawText: fallbackText,
                };

                set(state => ({
                    documents: [...state.documents, fallbackDoc],
                    pendingFiles: [...state.pendingFiles, fallbackDoc],
                    isIndexing: false,
                    ragEnabled: true,
                    status: "ready (fallback mode - no vector search)",
                }));
            } catch (fallbackError: any) {
                console.error("Fallback extraction failed:", fallbackError);
                set({
                    status: `Failed to load ${file.name}: ${e.message}. Try a different file.`,
                    isIndexing: false,
                });
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

    removeFile: (id: string) => {
        set(state => {
            const remaining = state.documents.filter(d => d.id !== id);
            const remainingPending = state.pendingFiles.filter(d => d.id !== id);
            // If no documents left, clear the worker index too
            if (remaining.length === 0) {
                postToWorker("CLEAR", {}).catch(() => {});
            } else {
                postToWorker("REMOVE_FILE", { fileKey: id }).catch(() => {});
            }
            return { documents: remaining, pendingFiles: remainingPending };
        });
    },

    clear: () => {
        postToWorker("CLEAR", {}).catch(() => {});
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

    toggle: () => set(state => ({ ragEnabled: !state.ragEnabled })),
}));

declare global {
    interface Window {
        __ON_RAG_STATUS: (status: string) => void;
    }
}
