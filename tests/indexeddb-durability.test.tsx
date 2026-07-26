// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Conversation } from "@/lib/chat/useChatStore";
import { useMemory } from "@/lib/memory/useMemory";

interface StoredMemory {
    id: string;
    content: string;
    embedding: number[];
    keywords: string[];
    timestamp: number;
    tags: string[];
}

function replaceIndexedDB(factory: IDBFactory) {
    Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: factory,
    });
}

function seedConversation(conversation: Conversation): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("n0x_chat", 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore("conversations", { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
        };
        request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("conversations", "readwrite");
            transaction.objectStore("conversations").put(conversation);
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        };
    });
}

function seedMemory(memory: StoredMemory): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("n0x_memory", 2);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => request.result.createObjectStore("memories", { keyPath: "id" });
        request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("memories", "readwrite");
            transaction.objectStore("memories").put(memory);
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        };
    });
}

function controlledWriteFactory() {
    const store = {
        add: vi.fn(() => ({}) as IDBRequest),
        delete: vi.fn(() => ({}) as IDBRequest),
        put: vi.fn(() => ({}) as IDBRequest),
    };
    const transaction = {
        error: null as DOMException | null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: vi.fn(() => store),
    };
    const database = {
        transaction: vi.fn(() => transaction),
        close: vi.fn(),
    };
    const openRequest = {
        result: database,
        error: null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: Event) => void) | null,
    };
    const factory = {
        open: vi.fn(() => {
            queueMicrotask(() => openRequest.onsuccess?.(new Event("success")));
            return openRequest;
        }),
    } as unknown as IDBFactory;

    return {
        factory,
        store,
        database,
        complete() {
            transaction.oncomplete?.(new Event("complete"));
        },
        fail() {
            transaction.error = new DOMException("Storage write failed", "QuotaExceededError");
            transaction.onabort?.(new Event("abort"));
        },
    };
}

describe("IndexedDB mutation durability", () => {
    beforeEach(() => {
        replaceIndexedDB(new IDBFactory());
        localStorage.clear();
    });

    it("surfaces a chat persistence failure without dropping the in-memory message", async () => {
        const { result } = renderHook(() => useChatStore());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));
        const write = controlledWriteFactory();
        replaceIndexedDB(write.factory);

        act(() => {
            result.current.addMessage({ role: "user", content: "keep this visible" });
        });
        await waitFor(() => expect(write.store.put).toHaveBeenCalledOnce());
        act(() => write.fail());

        await waitFor(() => expect(result.current.storageError).toMatch(/could not be saved/i));
        expect(result.current.messages.map(message => message.content)).toEqual(["keep this visible"]);
        expect(result.current.storageError).not.toContain("keep this visible");
    });

    it("does not resolve or remove a conversation until its delete transaction commits", async () => {
        const now = Date.now();
        await seedConversation({ id: "delete-me", title: "Delete", messages: [], createdAt: now, updatedAt: now });
        const { result } = renderHook(() => useChatStore());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));
        const write = controlledWriteFactory();
        replaceIndexedDB(write.factory);

        let deletion!: Promise<void>;
        let settled = false;
        act(() => {
            deletion = result.current.deleteConversation("delete-me");
            void deletion.then(() => {
                settled = true;
            });
        });
        await waitFor(() => expect(write.store.delete).toHaveBeenCalledWith("delete-me"));
        await Promise.resolve();

        expect(settled).toBe(false);
        expect(result.current.conversations.some(conversation => conversation.id === "delete-me")).toBe(true);

        await act(async () => {
            write.complete();
            await deletion;
        });
        expect(settled).toBe(true);
        expect(result.current.conversations.some(conversation => conversation.id === "delete-me")).toBe(false);
        expect(write.database.close).toHaveBeenCalledOnce();
    });

    it("restores an active conversation when its durable delete fails", async () => {
        const now = Date.now();
        await seedConversation({ id: "keep-active", title: "Keep", messages: [], createdAt: now, updatedAt: now });
        const { result } = renderHook(() => useChatStore());
        await waitFor(() => expect(result.current.activeId).toBe("keep-active"));
        const write = controlledWriteFactory();
        replaceIndexedDB(write.factory);

        let deletion!: Promise<void>;
        act(() => {
            deletion = result.current.deleteConversation("keep-active");
        });
        await waitFor(() => expect(write.store.delete).toHaveBeenCalledWith("keep-active"));
        expect(result.current.activeId).toBeNull();

        act(() => write.fail());
        await act(async () => deletion);

        expect(result.current.activeId).toBe("keep-active");
        expect(result.current.conversations.some(conversation => conversation.id === "keep-active")).toBe(true);
        expect(result.current.storageError).toMatch(/could not be deleted/i);
    });

    it("waits for memory save commit and keeps state truthful when a later save fails", async () => {
        const { result } = renderHook(() => useMemory());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));
        const successfulWrite = controlledWriteFactory();
        replaceIndexedDB(successfulWrite.factory);

        let save!: ReturnType<typeof result.current.saveMemory>;
        let settled = false;
        act(() => {
            save = result.current.saveMemory("durable memory", ["test"]);
            void save.then(() => {
                settled = true;
            });
        });
        await waitFor(() => expect(successfulWrite.store.add).toHaveBeenCalledOnce());

        expect(settled).toBe(false);
        expect(result.current.memories).toHaveLength(0);

        await act(async () => {
            successfulWrite.complete();
            await save;
        });
        expect(result.current.memories.map(memory => memory.content)).toEqual(["durable memory"]);

        const failedWrite = controlledWriteFactory();
        replaceIndexedDB(failedWrite.factory);
        let failedSave!: ReturnType<typeof result.current.saveMemory>;
        act(() => {
            failedSave = result.current.saveMemory("must not appear");
        });
        await waitFor(() => expect(failedWrite.store.add).toHaveBeenCalledOnce());
        act(() => failedWrite.fail());
        await act(async () => {
            await expect(failedSave).resolves.toBeNull();
        });

        expect(result.current.memories.map(memory => memory.content)).toEqual(["durable memory"]);
        expect(result.current.storageError).toMatch(/could not be saved/i);
        expect(result.current.storageError).not.toContain("must not appear");
    });

    it("keeps a memory visible when deletion fails, then removes it only after a committed retry", async () => {
        const memory: StoredMemory = {
            id: "memory-1",
            content: "remember this",
            embedding: [],
            keywords: ["remember"],
            timestamp: Date.now(),
            tags: [],
        };
        await seedMemory(memory);
        const { result } = renderHook(() => useMemory());
        await waitFor(() => expect(result.current.memories).toHaveLength(1));

        const failedWrite = controlledWriteFactory();
        replaceIndexedDB(failedWrite.factory);
        let failedDelete!: ReturnType<typeof result.current.deleteMemory>;
        act(() => {
            failedDelete = result.current.deleteMemory(memory.id);
        });
        await waitFor(() => expect(failedWrite.store.delete).toHaveBeenCalledWith(memory.id));
        expect(result.current.memories).toHaveLength(1);
        act(() => failedWrite.fail());
        await act(async () => {
            await expect(failedDelete).resolves.toBe(false);
        });
        expect(result.current.memories).toHaveLength(1);
        expect(result.current.storageError).toMatch(/could not be deleted/i);

        const successfulWrite = controlledWriteFactory();
        replaceIndexedDB(successfulWrite.factory);
        let successfulDelete!: ReturnType<typeof result.current.deleteMemory>;
        act(() => {
            successfulDelete = result.current.deleteMemory(memory.id);
        });
        await waitFor(() => expect(successfulWrite.store.delete).toHaveBeenCalledWith(memory.id));
        expect(result.current.memories).toHaveLength(1);
        await act(async () => {
            successfulWrite.complete();
            await expect(successfulDelete).resolves.toBe(true);
        });
        expect(result.current.memories).toHaveLength(0);
    });
});

describe("memory hydration races", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("merges a save that commits before the initial getAll callback", async () => {
        const diskMemory: StoredMemory = {
            id: "from-disk",
            content: "loaded later",
            embedding: [],
            keywords: ["loaded"],
            timestamp: 1,
            tags: [],
        };
        const getAllRequest = {
            result: [] as StoredMemory[],
            error: null,
            onsuccess: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
        };
        const readStore = { getAll: vi.fn(() => getAllRequest) };
        const readTransaction = {
            error: null,
            onerror: null as ((event: Event) => void) | null,
            onabort: null as ((event: Event) => void) | null,
            objectStore: vi.fn(() => readStore),
        };
        const readDatabase = { transaction: vi.fn(() => readTransaction), close: vi.fn() };
        const write = controlledWriteFactory();
        const readOpenRequest = {
            result: readDatabase,
            error: null,
            onsuccess: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
            onupgradeneeded: null as ((event: Event) => void) | null,
        };
        let openCount = 0;
        const factory = {
            open: vi.fn(() => {
                openCount += 1;
                if (openCount === 1) {
                    queueMicrotask(() => readOpenRequest.onsuccess?.(new Event("success")));
                    return readOpenRequest;
                }
                return write.factory.open("n0x_memory", 2);
            }),
        } as unknown as IDBFactory;
        replaceIndexedDB(factory);

        const { result } = renderHook(() => useMemory());
        await waitFor(() => expect(readStore.getAll).toHaveBeenCalledOnce());
        let save!: ReturnType<typeof result.current.saveMemory>;
        act(() => {
            save = result.current.saveMemory("saved while loading");
        });
        await waitFor(() => expect(write.store.add).toHaveBeenCalledOnce());
        await act(async () => {
            write.complete();
            await expect(save).resolves.toMatchObject({ content: "saved while loading" });
        });
        expect(result.current.memories.map(memory => memory.content)).toEqual(["saved while loading"]);

        await act(async () => {
            getAllRequest.result = [diskMemory];
            getAllRequest.onsuccess?.(new Event("success"));
        });

        expect(result.current.isLoaded).toBe(true);
        expect(result.current.memories.map(memory => memory.content).sort()).toEqual([
            "loaded later",
            "saved while loading",
        ]);
    });
});
