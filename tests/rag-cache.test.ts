// @vitest-environment node

import { File } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RagCacheModule = typeof import("@/lib/retrieval/rag-cache");

describe("content-addressed RAG persistence", () => {
    let cache: RagCacheModule;

    beforeEach(async () => {
        vi.resetModules();
        vi.stubGlobal("indexedDB", new IDBFactory());
        vi.stubGlobal("crypto", webcrypto);
        cache = await import("@/lib/retrieval/rag-cache");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("isolates equal-metadata files by their SHA-256 content identity", async () => {
        const metadata = { type: "text/plain", lastModified: 1_700_000_000_000 };
        const first = new File(["alpha"], "same.txt", metadata);
        const second = new File(["bravo"], "same.txt", metadata);

        expect(first.name).toBe(second.name);
        expect(first.size).toBe(second.size);
        expect(first.lastModified).toBe(second.lastModified);

        const firstId = await cache.createDocumentId(first);
        const secondId = await cache.createDocumentId(second);

        expect(firstId).toBe(`sha256-${createHash("sha256").update("alpha").digest("hex")}`);
        expect(secondId).toBe(`sha256-${createHash("sha256").update("bravo").digest("hex")}`);
        expect(firstId).not.toBe(secondId);

        await cache.saveVectorsToCache(firstId, [
            [
                `${firstId}-0`,
                { documentId: firstId, documentName: "same.txt", chunkIndex: 1, text: "alpha", embedding: [1, 0] },
            ],
        ]);
        await cache.saveVectorsToCache(secondId, [
            [
                `${secondId}-0`,
                { documentId: secondId, documentName: "same.txt", chunkIndex: 1, text: "bravo", embedding: [0, 1] },
            ],
        ]);

        expect((await cache.getCachedVectors(firstId))?.chunks[0][1].text).toBe("alpha");
        expect((await cache.getCachedVectors(secondId))?.chunks[0][1].text).toBe("bravo");
    });

    it("deletes only the removed document record, then deletes every record on clear", async () => {
        const firstId = await cache.createDocumentId(new File(["alpha"], "same.txt"));
        const secondId = await cache.createDocumentId(new File(["bravo"], "same.txt"));
        await cache.saveVectorsToCache(firstId, [
            [
                `${firstId}-0`,
                { documentId: firstId, documentName: "same.txt", chunkIndex: 1, text: "alpha", embedding: [1, 0] },
            ],
        ]);
        await cache.saveVectorsToCache(secondId, [
            [
                `${secondId}-0`,
                { documentId: secondId, documentName: "same.txt", chunkIndex: 1, text: "bravo", embedding: [0, 1] },
            ],
        ]);

        await cache.deleteVectorsFromCache(firstId);

        expect(await cache.getCachedVectors(firstId)).toBeNull();
        expect(await cache.getCachedVectors(secondId)).not.toBeNull();

        await cache.clearVectorsCache();

        expect(await cache.getCachedVectors(secondId)).toBeNull();
    });
});
