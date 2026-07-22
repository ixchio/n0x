// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageManager } from "@/components/system/storage-manager";

function source(relativePath: string) {
    return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function stringConstant(contents: string, name: string) {
    return contents.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
}

function openDatabase(name: string, version: number, store: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onsuccess = () => resolve(request.result);
    });
}

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`Deletion of ${name} was blocked`));
        request.onsuccess = () => resolve();
    });
}

describe("IndexedDB storage contract", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            value: new IDBFactory(),
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("keeps stable database and object-store names", () => {
        const chat = source("lib/chat/useChatStore.ts");
        const memory = source("lib/memory/useMemory.ts");
        const rag = source("lib/retrieval/rag.worker.ts");

        expect([stringConstant(chat, "DB_NAME"), stringConstant(chat, "STORE")]).toEqual(["n0x_chat", "conversations"]);
        expect([stringConstant(memory, "DB_NAME"), stringConstant(memory, "STORE_NAME")]).toEqual([
            "n0x_memory",
            "memories",
        ]);
        expect([stringConstant(rag, "DB_NAME"), stringConstant(rag, "STORE_NAME")]).toEqual([
            "n0x_rag_cache",
            "vectors",
        ]);
    });

    it("keeps the storage manager aligned with every user-owned database", () => {
        const manager = source("components/system/storage-manager.tsx");

        for (const database of ["n0x_chat", "n0x_memory", "n0x_rag_cache"]) {
            expect(manager).toContain(`clearDatabase("${database}"`);
        }
    });

    it.each(["n0x_chat", "n0x_memory", "n0x_rag_cache"])(
        "deletes %s and allows it to reopen with a fresh version and schema",
        async databaseName => {
            const original = await openDatabase(databaseName, 1, "stale-store");
            original.close();

            await deleteDatabase(databaseName);
            const reopened = await openDatabase(databaseName, 2, "fresh-store");

            expect(reopened.version).toBe(2);
            expect([...reopened.objectStoreNames]).toEqual(["fresh-store"]);
            reopened.close();
        }
    );

    it.each([
        ["Chat History", "n0x_chat"],
        ["Semantic Memory", "n0x_memory"],
        ["RAG Vector Cache", "n0x_rag_cache"],
    ])("sends the %s confirmation to the exact %s database", (rowTitle, databaseName) => {
        const pendingRequest = {} as IDBOpenDBRequest;
        const deleteSpy = vi.spyOn(indexedDB, "deleteDatabase").mockReturnValue(pendingRequest);
        render(React.createElement(StorageManager));

        fireEvent.click(screen.getByRole("button", { name: "Storage Manager" }));
        fireEvent.click(screen.getByRole("button", { name: `Clear ${rowTitle}` }));
        fireEvent.click(screen.getByRole("button", { name: `Confirm clearing ${rowTitle}` }));

        expect(deleteSpy).toHaveBeenCalledOnce();
        expect(deleteSpy).toHaveBeenCalledWith(databaseName);
    });
});
