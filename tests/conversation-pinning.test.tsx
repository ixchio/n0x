// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore, type Conversation } from "@/lib/chat/useChatStore";

function seedConversations(conversations: Conversation[]) {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("n0x_chat", 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore("conversations", { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
        };
        request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("conversations", "readwrite");
            for (const conversation of conversations) transaction.objectStore("conversations").put(conversation);
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        };
    });
}

describe("conversation pinning and hydration", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            value: new IDBFactory(),
        });
        localStorage.clear();
    });

    it("keeps an async completion in its pinned conversation after the user switches", async () => {
        const { result, unmount } = renderHook(() => useChatStore());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        let firstId = "";
        let secondId = "";
        act(() => {
            firstId = result.current.pinConversation();
            result.current.addMessageToConversation(firstId, { role: "user", content: "first prompt" });
            result.current.newConversation();
            secondId = result.current.pinConversation();
            result.current.addMessageToConversation(secondId, { role: "user", content: "second prompt" });
        });

        act(() => {
            result.current.addMessageToConversation(firstId, { role: "assistant", content: "first answer" });
        });

        expect(result.current.activeId).toBe(secondId);
        expect(result.current.getConversationMessages(firstId).map(message => message.content)).toEqual([
            "first prompt",
            "first answer",
        ]);
        expect(result.current.getConversationMessages(secondId).map(message => message.content)).toEqual([
            "second prompt",
        ]);
        unmount();
    });

    it("restores the persisted active conversation after hydration", async () => {
        const now = Date.now();
        const conversations: Conversation[] = [
            { id: "older", title: "Older", messages: [], createdAt: now - 10, updatedAt: now - 10 },
            { id: "selected", title: "Selected", messages: [], createdAt: now, updatedAt: now },
        ];
        await seedConversations(conversations);
        localStorage.setItem("n0x_activeConv", "older");

        const { result, unmount } = renderHook(() => useChatStore());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        expect(result.current.activeId).toBe("older");
        expect(result.current.conversations.map(conversation => conversation.id).sort()).toEqual(["older", "selected"]);
        unmount();
    });
});
