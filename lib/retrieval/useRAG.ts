"use client";

import { create } from "zustand";
import { trackFunnelEvent } from "@/lib/core/analytics";
import { logger } from "@/lib/core/logger";
import { createDocumentId } from "@/lib/retrieval/rag-cache";
import {
    calculateBm25Scores,
    chunkDirectEvidence,
    formatRagEvidence,
    hasSufficientEvidence,
    isRagSearchResult,
    isWholeDocumentQuery,
    rankRagEvidence,
    selectDiverseWholeDocumentEvidence,
    type RAGSearchResult,
} from "@/lib/retrieval/rag-evidence";
import { getFileExtension, limitExtractedText, validateRagFile } from "@/lib/retrieval/file-policy";

export type { RAGSearchResult } from "@/lib/retrieval/rag-evidence";

export interface RAGDocument {
    id: string;
    name: string;
    size: number;
    type: string;
    chunks: number;
    rawText: string; // Store full raw text only for small files (direct injection)
}

export interface RAGState {
    documents: RAGDocument[];
    isIndexing: boolean;
    status: string;
    storageError: string | null;
    ragEnabled: boolean;
    pendingFiles: RAGDocument[];

    // Actions
    addFile: (file: File) => Promise<boolean>;
    search: (query: string, limit?: number) => Promise<RAGSearchResult[]>;
    getFileContext: (query: string) => Promise<string>;
    removeFile: (id: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
    clearPending: () => void;
    clearCache: () => Promise<boolean>;
    toggle: () => void;
}

// Singleton Worker interface
let ragWorker: Worker | null = null;
let msgIdCounter = 0;
const resolvers = new Map<number, { resolve: Function; reject: Function; timeout: ReturnType<typeof setTimeout> }>();
let ragMutationEpoch = 0;
let ragAddQueue: Promise<void> = Promise.resolve();
let ragQueuedAdds = 0;

function resetWorker(error: Error): void {
    const worker = ragWorker;
    ragWorker = null;
    if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
    }

    for (const pending of resolvers.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
    }
    resolvers.clear();
}

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
            logger.error("Worker fatal error:", e);
            const error = new Error("Document worker crashed. Try a smaller file or clear the RAG cache.");
            resetWorker(error);
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
            resetWorker(new Error(`${action} timed out. The document worker was stopped; try again.`));
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
    storageError: null,
    ragEnabled: false,
    pendingFiles: [],

    addFile: (file: File) => {
        ragQueuedAdds += 1;
        const operationEpoch = ragMutationEpoch;
        const operation = ragAddQueue.then(async () => {
            if (operationEpoch !== ragMutationEpoch) return false;
            try {
                const validationError = validateRagFile(file);
                if (validationError) {
                    set({ isIndexing: false, status: validationError });
                    return false;
                }
                trackFunnelEvent("document_uploaded", {
                    type: file.type || getFileExtension(file.name) || "unknown",
                    sizeBucket: file.size < 1024 * 1024 ? "small" : file.size < 10 * 1024 * 1024 ? "medium" : "large",
                });
                set({ isIndexing: true, status: `Initializing Worker for ${file.name}...`, storageError: null });

                const newDoc = await postToWorker("ADD_FILE", { file }, status => {
                    if (operationEpoch === ragMutationEpoch) set({ status });
                });

                if (operationEpoch !== ragMutationEpoch) {
                    set({ isIndexing: false });
                    return false;
                }

                set(state => {
                    const duplicate = state.documents.some(document => document.id === newDoc.id);
                    const documents = duplicate
                        ? state.documents.map(document => (document.id === newDoc.id ? newDoc : document))
                        : [...state.documents, newDoc];
                    const pendingFiles = state.pendingFiles.some(document => document.id === newDoc.id)
                        ? state.pendingFiles.map(document => (document.id === newDoc.id ? newDoc : document))
                        : [...state.pendingFiles, newDoc];

                    return {
                        documents,
                        pendingFiles,
                        isIndexing: false,
                        ragEnabled: true,
                        status: duplicate
                            ? `Already attached: ${newDoc.name} (duplicate content was not added).`
                            : "ready",
                    };
                });
                return true;
            } catch (e: any) {
                logger.error("RAG Worker Error:", e);

                // Try fallback extraction
                try {
                    if (operationEpoch !== ragMutationEpoch) {
                        set({ isIndexing: false });
                        return false;
                    }
                    set({ status: `Worker failed, trying fallback extraction...` });

                    let fallbackText = "";
                    const ext = getFileExtension(file.name);
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
                        throw new Error(
                            `Could not extract text from “${file.name}”. Try a text-based copy of the document.`
                        );
                    } else {
                        try {
                            fallbackText = limitExtractedText((await file.text()) || "");
                        } catch {
                            fallbackText = `[Could not read ${file.name}. File may be corrupted or in an unsupported format.]`;
                        }
                    }

                    if (!fallbackText.trim()) {
                        throw new Error("File appears to be empty");
                    }

                    const fallbackDoc: RAGDocument = {
                        id: await createDocumentId(file),
                        name: file.name,
                        size: file.size,
                        type: file.type || ext || "unknown",
                        chunks: 1,
                        rawText: fallbackText,
                    };

                    if (operationEpoch !== ragMutationEpoch) {
                        set({ isIndexing: false });
                        return false;
                    }

                    set(state => {
                        const duplicate = state.documents.some(document => document.id === fallbackDoc.id);
                        const documents = duplicate
                            ? state.documents.map(document => (document.id === fallbackDoc.id ? fallbackDoc : document))
                            : [...state.documents, fallbackDoc];
                        const pendingFiles = state.pendingFiles.some(document => document.id === fallbackDoc.id)
                            ? state.pendingFiles.map(document =>
                                  document.id === fallbackDoc.id ? fallbackDoc : document
                              )
                            : [...state.pendingFiles, fallbackDoc];

                        return {
                            documents,
                            pendingFiles,
                            isIndexing: false,
                            ragEnabled: true,
                            status: duplicate
                                ? `Already attached: ${fallbackDoc.name} (duplicate content was not added).`
                                : "ready (fallback mode - no vector search)",
                        };
                    });
                    return true;
                } catch (fallbackError: any) {
                    logger.error("Fallback extraction failed:", fallbackError);
                    set({
                        status: `Failed to load ${file.name}: ${fallbackError.message || e.message}. Try a different file.`,
                        isIndexing: false,
                    });
                    return false;
                }
            }
        });
        const trackedOperation = operation.finally(() => {
            ragQueuedAdds = Math.max(0, ragQueuedAdds - 1);
        });
        ragAddQueue = trackedOperation.then(
            () => undefined,
            () => undefined
        );
        return trackedOperation;
    },

    search: async (query: string, limit: number = 3) => {
        const safeLimit = Math.max(1, Math.floor(limit));
        const { documents } = get();
        let indexedResults: RAGSearchResult[] = [];

        if (documents.some(document => !document.rawText && document.chunks > 0)) {
            try {
                const workerResults = await postToWorker("SEARCH", {
                    query,
                    limit: safeLimit,
                    documents: documents
                        .filter(document => !document.rawText && document.chunks > 0)
                        .map(document => ({ id: document.id, name: document.name })),
                });
                indexedResults = Array.isArray(workerResults) ? workerResults.filter(isRagSearchResult) : [];
            } catch (e) {
                logger.error("Worker search failed:", e);
            }
        }

        const directDocuments = documents.filter(document => document.rawText.trim().length > 0);
        const directChunks = directDocuments.flatMap(document =>
            chunkDirectEvidence(document.rawText).map(chunk => ({
                ...chunk,
                candidateId: `${document.id}#chunk-${chunk.chunkIndex}`,
                document,
            }))
        );
        const directBm25Scores = calculateBm25Scores(
            query,
            directChunks.map(chunk => ({ id: chunk.candidateId, text: chunk.text }))
        );
        const directResults = directChunks.flatMap<RAGSearchResult>(chunk => {
            const relevance = {
                vector: null,
                bm25: directBm25Scores.get(chunk.candidateId) ?? 0,
                fused: null,
            };
            if (!hasSufficientEvidence(query, chunk.text, relevance)) return [];
            return [
                {
                    documentId: chunk.document.id,
                    documentName: chunk.document.name,
                    chunkIndex: chunk.chunkIndex,
                    text: chunk.text,
                    relevance,
                },
            ];
        });

        if (indexedResults.length === 0 && directResults.length > 0 && isWholeDocumentQuery(query)) {
            return selectDiverseWholeDocumentEvidence(directResults, safeLimit);
        }

        return rankRagEvidence([...indexedResults, ...directResults], query).slice(0, safeLimit);
    },

    getFileContext: async (query: string) => {
        const { documents } = get();
        if (documents.length === 0) return "";

        try {
            return formatRagEvidence(await get().search(query, 4));
        } catch (e) {
            logger.error("RAG search failed:", e);
            return formatRagEvidence([]);
        }
    },

    removeFile: async (id: string) => {
        set({ status: "Removing document from this device...", storageError: null });
        ragMutationEpoch += 1;
        try {
            // A raw-text attachment can share its content hash with a stale or
            // orphaned vector record from an earlier indexed run. Deleting a
            // missing key is a successful no-op, so every removal commits the
            // durable delete before the attachment disappears from the UI.
            await postToWorker("REMOVE_FILE", { fileKey: id });
            set(state => ({
                documents: state.documents.filter(document => document.id !== id),
                pendingFiles: state.pendingFiles.filter(document => document.id !== id),
                status: "ready",
                storageError: null,
                isIndexing: false,
            }));
            return true;
        } catch (error) {
            logger.error("Failed to remove the document from the persistent RAG cache:", error);
            const storageError =
                "Document removal could not be saved. The document is still attached. Check browser storage and try again.";
            set({ status: storageError, storageError });
            return false;
        }
    },

    clear: async () => {
        ragMutationEpoch += 1;
        set({ status: "Removing all documents from this device...", storageError: null });
        try {
            // Always clear the durable store. Attachments are intentionally not
            // hydrated after a reload, so an empty in-memory list cannot prove
            // that IndexedDB has no cached vectors or an orphaned partial add.
            await postToWorker("CLEAR", {});
            set({ documents: [], pendingFiles: [], status: "ready", storageError: null, isIndexing: false });
            return true;
        } catch (error) {
            logger.error("Failed to clear the persistent RAG cache:", error);
            const storageError =
                "Documents could not be cleared. They are still attached. Check browser storage and try again.";
            set({ status: storageError, storageError });
            return false;
        }
    },

    clearPending: () => {
        set({ pendingFiles: [] });
    },

    clearCache: async () => {
        try {
            await postToWorker("CLEAR_CACHE", {});
            set({ storageError: null });
            return true;
        } catch (error) {
            logger.error("RAG error:", error);
            const storageError = "The document cache could not be cleared. Check browser storage and try again.";
            set({ status: storageError, storageError });
            return false;
        }
    },

    toggle: () => set(state => ({ ragEnabled: !state.ragEnabled })),
}));

declare global {
    interface Window {
        __ON_RAG_STATUS: (status: string) => void;
    }
}
