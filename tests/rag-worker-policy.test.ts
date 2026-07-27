// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteVectors: vi.fn(),
    clearVectors: vi.fn(),
    getCachedVectors: vi.fn(),
    saveVectors: vi.fn(),
    pipeline: vi.fn(),
    embed: vi.fn(),
    voyConstructed: vi.fn(),
    pdfGetDocument: vi.fn(),
    embeddingModuleLoaded: vi.fn(),
    voyModuleLoaded: vi.fn(),
    pdfModuleLoaded: vi.fn(),
}));

vi.mock("@/lib/retrieval/rag-cache", () => ({
    CACHE_VERSION: 3,
    clearVectorsCache: mocks.clearVectors,
    createDocumentId: vi.fn().mockResolvedValue("sha256-test"),
    deleteVectorsFromCache: mocks.deleteVectors,
    getCachedVectors: mocks.getCachedVectors,
    saveVectorsToCache: mocks.saveVectors,
}));

vi.mock("@huggingface/transformers", () => {
    mocks.embeddingModuleLoaded();
    return {
        env: { allowLocalModels: true, useBrowserCache: false, backends: { onnx: { wasm: {} } } },
        pipeline: mocks.pipeline,
    };
});

vi.mock("voy-search", () => {
    mocks.voyModuleLoaded();
    return {
        Voy: class {
            constructor() {
                mocks.voyConstructed();
            }
            add() {}
            search() {
                return [];
            }
        },
    };
});

vi.mock("pdfjs-dist", () => {
    mocks.pdfModuleLoaded();
    return {
        GlobalWorkerOptions: { workerSrc: "" },
        getDocument: mocks.pdfGetDocument,
    };
});

interface WorkerRequest {
    id: number;
    action: string;
    payload: {
        file?: FileLike;
        fileKey?: string;
        query?: string;
        limit?: number;
        documents?: Array<{ id: string; name: string }>;
    };
}

interface FileLike {
    name: string;
    size: number;
    type: string;
    text: () => Promise<string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
}

let messageHandler: ((event: { data: WorkerRequest }) => Promise<void>) | null = null;
let posted: Array<Record<string, unknown>> = [];

function textFile(name: string, content: string): FileLike {
    return {
        name,
        size: new TextEncoder().encode(content).byteLength,
        type: "text/plain",
        text: async () => content,
        arrayBuffer: async () => new TextEncoder().encode(content).buffer,
    };
}

async function loadWorker() {
    const scope = {
        addEventListener: (_type: string, handler: (event: { data: WorkerRequest }) => Promise<void>) => {
            messageHandler = handler;
        },
        postMessage: (message: Record<string, unknown>) => posted.push(message),
    };
    vi.stubGlobal("self", scope);
    await import("@/lib/retrieval/rag.worker");
    if (!messageHandler) throw new Error("RAG worker did not register its message handler");
}

describe("RAG worker loading and indexing policy", () => {
    beforeEach(async () => {
        vi.resetModules();
        posted = [];
        messageHandler = null;
        Object.values(mocks).forEach(mock => mock.mockReset());
        mocks.getCachedVectors.mockResolvedValue(null);
        mocks.saveVectors.mockResolvedValue(undefined);
        mocks.pipeline.mockResolvedValue(mocks.embed);
        await loadWorker();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("directly injects a tiny text file without initializing PDF or vector dependencies", async () => {
        const file = textFile("sample.md", "A tiny local sample with a cited fact.");
        await messageHandler!({ data: { id: 1, action: "ADD_FILE", payload: { file } } });

        expect(posted.at(-1)).toMatchObject({
            id: 1,
            done: true,
            result: { id: "sha256-test", name: "sample.md", chunks: 1, rawText: expect.stringContaining("cited fact") },
        });
        expect(mocks.pipeline).not.toHaveBeenCalled();
        expect(mocks.voyConstructed).not.toHaveBeenCalled();
        expect(mocks.pdfGetDocument).not.toHaveBeenCalled();
        expect(mocks.embeddingModuleLoaded).not.toHaveBeenCalled();
        expect(mocks.voyModuleLoaded).not.toHaveBeenCalled();
        expect(mocks.pdfModuleLoaded).not.toHaveBeenCalled();
        expect(mocks.getCachedVectors).not.toHaveBeenCalled();
    });

    it("keeps a resume-sized text document on the direct BM25 path", async () => {
        const file = textFile("resume.txt", "Experienced local-first AI engineer. ".repeat(320));
        expect(file.size).toBeGreaterThan(8_000);

        await messageHandler!({ data: { id: 14, action: "ADD_FILE", payload: { file } } });

        expect(posted.at(-1)).toMatchObject({
            id: 14,
            done: true,
            result: { name: "resume.txt", chunks: 1, rawText: expect.stringContaining("local-first") },
        });
        expect(mocks.pipeline).not.toHaveBeenCalled();
        expect(mocks.voyConstructed).not.toHaveBeenCalled();
        expect(mocks.getCachedVectors).not.toHaveBeenCalled();
    });

    it("restores a replacement worker from content-addressed cached chunks before search", async () => {
        mocks.getCachedVectors.mockResolvedValue({
            version: 3,
            timestamp: 1,
            chunks: [
                [
                    "sha256-policy-0",
                    {
                        documentId: "sha256-policy",
                        documentName: "old-name.pdf",
                        chunkIndex: 1,
                        text: "The policy retains records for thirty days.",
                        embedding: [1, 0, 0],
                    },
                ],
            ],
        });

        await messageHandler!({
            data: {
                id: 11,
                action: "SEARCH",
                payload: {
                    query: "Summarize the uploaded document",
                    limit: 3,
                    documents: [{ id: "sha256-policy", name: "current-policy.pdf" }],
                },
            },
        });

        expect(mocks.getCachedVectors).toHaveBeenCalledExactlyOnceWith("sha256-policy");
        expect(posted.at(-1)).toMatchObject({
            id: 11,
            done: true,
            result: [
                expect.objectContaining({
                    documentId: "sha256-policy",
                    documentName: "current-policy.pdf",
                    text: expect.stringContaining("thirty days"),
                }),
            ],
        });
    });

    it("fails indexing instead of caching or returning a zero-chunk ghost document", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.embed.mockRejectedValue(new Error("embedding backend unavailable"));
        const file = textFile("large.txt", "A complete sentence with searchable policy detail. ".repeat(800));

        await messageHandler!({ data: { id: 2, action: "ADD_FILE", payload: { file } } });

        expect(mocks.pipeline).toHaveBeenCalledOnce();
        expect(mocks.pipeline).toHaveBeenCalledWith(
            "feature-extraction",
            "Xenova/all-MiniLM-L6-v2",
            expect.objectContaining({ device: "wasm" })
        );
        expect(mocks.saveVectors).not.toHaveBeenCalled();
        expect(posted.at(-1)).toMatchObject({ id: 2, done: true, error: expect.stringMatching(/not indexed/i) });
        expect(posted.some(message => (message.result as { chunks?: number } | undefined)?.chunks === 0)).toBe(false);
    });

    it("does not report a large indexed document as attached when its durable cache write fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.embed.mockResolvedValue({ data: [1, 0, 0] });
        mocks.saveVectors.mockRejectedValue(new Error("IndexedDB quota denied"));

        await messageHandler!({
            data: {
                id: 12,
                action: "ADD_FILE",
                payload: { file: textFile("large.txt", "Durable policy text. ".repeat(1_800)) },
            },
        });

        expect(posted.at(-1)).toMatchObject({ id: 12, done: true, error: expect.stringMatching(/persist/i) });
        expect(posted.some(message => (message.result as { name?: string } | undefined)?.name === "large.txt")).toBe(
            false
        );
    });

    it("deletes a same-ID stale cache record even when the live worker has no indexed chunks", async () => {
        mocks.deleteVectors.mockResolvedValue(undefined);

        await messageHandler!({
            data: { id: 13, action: "REMOVE_FILE", payload: { fileKey: "sha256-direct-fallback" } },
        });

        expect(mocks.deleteVectors).toHaveBeenCalledExactlyOnceWith("sha256-direct-fallback");
        expect(posted.at(-1)).toMatchObject({ id: 13, result: true, done: true });
    });

    it("samples the beginning, middle, and end of a large indexed document for summary requests", async () => {
        mocks.embed.mockResolvedValue({ data: [1, 0, 0] });
        const content =
            "BEGIN-MARKER opening scope. " +
            "A stable middle section explains ordinary policy details. ".repeat(700) +
            "END-MARKER final conclusion.";

        await messageHandler!({
            data: { id: 3, action: "ADD_FILE", payload: { file: textFile("large.txt", content) } },
        });
        mocks.embed.mockClear();
        posted = [];

        await messageHandler!({
            data: {
                id: 4,
                action: "SEARCH",
                payload: { query: "Summarize the uploaded document", limit: 4 },
            },
        });

        const result = posted.at(-1)?.result as Array<{ chunkIndex: number; text: string }>;
        expect(result).toHaveLength(4);
        expect(result[0].chunkIndex).toBe(1);
        expect(result[0].text).toContain("BEGIN-MARKER");
        expect(result.at(-1)?.text).toContain("END-MARKER");
        expect(result.at(-1)!.chunkIndex).toBeGreaterThan(result[1].chunkIndex);
        expect(mocks.embed).not.toHaveBeenCalled();
    });

    it("pins PDF.js to the bundled worker rather than a runtime CDN", () => {
        const source = readFileSync(resolve(process.cwd(), "lib/retrieval/rag.worker.ts"), "utf8");
        expect(source).toContain('"pdfjs-dist/build/pdf.worker.min.mjs"');
        expect(source).toContain("import.meta.url");
        expect(source).toContain("verbosity: 0");
        expect(source).not.toMatch(/cdn\.jsdelivr\.net|\/\/cdn\./i);
    });

    it("selects ONNX Runtime's bundler-safe external WASM file", () => {
        const configSource = readFileSync(resolve(process.cwd(), "next.config.mjs"), "utf8");

        expect(configSource).toContain('"onnxruntime-web/webgpu$"');
        expect(configSource).toContain('"node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs"');
    });
});
