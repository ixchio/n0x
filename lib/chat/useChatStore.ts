"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ExecutionPrivacyPath, ExecutionProvider } from "./executionPlan";

export type ChatProvider = ExecutionProvider;
export type ChatPrivacyPath = ExecutionPrivacyPath;

export interface ChatCitation {
    documentId: string;
    documentName: string;
    chunkIndex: number;
    /** Exact untrusted passage supplied to the model for this answer. */
    text: string;
    relevance?: {
        vector: number | null;
        bm25: number | null;
        fused: number | null;
    };
}

export interface ChatMessageMeta {
    provider?: ChatProvider;
    providerLabel?: string;
    modelName?: string;
    privacy?: ChatPrivacyPath;
    route?: "local" | "cloud" | "default";
    usedSearch?: boolean;
    usedDocs?: boolean;
    usedMemory?: boolean;
    usedPython?: boolean;
    agent?: boolean;
    requestId?: string;
    conversationId?: string;
    routeReason?: string;
    contextBudget?: number;
    contextWindow?: number;
    outputReserve?: number;
    maxOutputTokens?: number;
    /** Evidence snapshot used for this answer, persisted with chat history. */
    citations?: ChatCitation[];
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    image?: string;
    timestamp: number;
    meta?: ChatMessageMeta;
}

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

const DB_NAME = "n0x_chat";
const DB_VER = 1;
const STORE = "conversations";
const ACTIVE_KEY = "n0x_activeConv";
const CHAT_LOAD_ERROR = "Chat history is unavailable. Check this site's storage permission and reload.";
const CHAT_SAVE_ERROR = "Chat history could not be saved. Free browser storage or allow site storage, then try again.";
const CHAT_DELETE_ERROR =
    "The conversation could not be deleted from this device. Check browser storage and try again.";

let messageIdCounter = 0;

export function createChatMessageId(): string {
    if (globalThis.crypto?.randomUUID) {
        return `msg_${globalThis.crypto.randomUUID()}`;
    }

    messageIdCounter += 1;
    return `msg_${Date.now()}_${messageIdCounter}_${Math.random().toString(36).slice(2, 10)}`;
}

function createConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureUniqueMessageIds(messages: ChatMessage[]): { messages: ChatMessage[]; changed: boolean } {
    const seen = new Set<string>();
    let changed = false;

    const repaired = messages.map(message => {
        const existingId = typeof message.id === "string" ? message.id.trim() : "";
        let id = existingId;

        if (!id || seen.has(id)) {
            id = createChatMessageId();
            changed = true;
        }

        seen.add(id);
        return id === message.id ? message : { ...message, id };
    });

    return { messages: repaired, changed };
}

function repairConversation(conv: Conversation): { conversation: Conversation; changed: boolean } {
    const { messages, changed } = ensureUniqueMessageIds(conv.messages || []);
    return {
        conversation: changed ? { ...conv, messages } : conv,
        changed,
    };
}

function openDB(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = factory.open(DB_NAME, DB_VER);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = e => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE)) {
                const s = db.createObjectStore(STORE, { keyPath: "id" });
                s.createIndex("updatedAt", "updatedAt", { unique: false });
            }
        };
    });
}

async function putConversation(conversation: Conversation, factory: IDBFactory): Promise<void> {
    const db = await openDB(factory);
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE, "readwrite");
            transaction.objectStore(STORE).put(conversation);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        db.close();
    }
}

function titleFrom(text: string): string {
    const s = text.replace(/\n/g, " ").trim();
    return s.length > 40 ? s.slice(0, 40) + "..." : s;
}

export function useChatStore() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, _setActiveId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [storageError, setStorageError] = useState<string | null>(null);

    // Refs make request pinning/getters synchronous, including between React
    // renders and while an async generation is in flight.
    const activeRef = useRef<string | null>(null);
    const conversationsRef = useRef<Conversation[]>([]);
    const persistQueuesRef = useRef(new Map<string, Promise<void>>());
    const deletedConversationIdsRef = useRef(new Set<string>());
    const setActiveId = useCallback((id: string | null) => {
        activeRef.current = id;
        _setActiveId(id);
        // persist which conversation is active (including null = "new session")
        try {
            if (id) localStorage.setItem(ACTIVE_KEY, id);
            else localStorage.setItem(ACTIVE_KEY, "__new__");
        } catch {}
    }, []);

    useEffect(() => {
        (async () => {
            let db: IDBDatabase | null = null;
            try {
                db = await openDB();
                const tx = db.transaction(STORE, "readonly");
                const req = tx.objectStore(STORE).getAll();
                req.onsuccess = () => {
                    let repairedAny = false;
                    const all = (req.result || [])
                        .map((conv: Conversation) => {
                            const repaired = repairConversation(conv);
                            repairedAny = repairedAny || repaired.changed;
                            return repaired.conversation;
                        })
                        .sort((a: Conversation, b: Conversation) => b.updatedAt - a.updatedAt);
                    setConversations(current => {
                        // A request can begin before IndexedDB finishes opening.
                        // Prefer those in-memory conversations over older disk copies.
                        const currentIds = new Set(current.map(conv => conv.id));
                        const merged = [...current, ...all.filter(conv => !currentIds.has(conv.id))].sort(
                            (a, b) => b.updatedAt - a.updatedAt
                        );
                        conversationsRef.current = merged;
                        return merged;
                    });

                    // restore persisted active conversation
                    let stored: string | null = null;
                    try {
                        stored = localStorage.getItem(ACTIVE_KEY);
                    } catch {}

                    if (activeRef.current) {
                        // A conversation was already selected/pinned while storage loaded.
                    } else if (stored === "__new__") {
                        // user explicitly clicked "new session" — stay on blank
                        setActiveId(null);
                    } else if (stored && all.some(c => c.id === stored)) {
                        // restore the exact conversation they were on
                        setActiveId(stored);
                    } else if (all.length > 0) {
                        // fallback: most recent
                        setActiveId(all[0].id);
                    }

                    setIsLoaded(true);

                    if (repairedAny && db) {
                        const repairTx = db.transaction(STORE, "readwrite");
                        const store = repairTx.objectStore(STORE);
                        all.forEach((conv: Conversation) => store.put(conv));
                        repairTx.oncomplete = () => db?.close();
                        repairTx.onerror = repairTx.onabort = () => {
                            setStorageError(CHAT_SAVE_ERROR);
                            db?.close();
                        };
                    } else {
                        db?.close();
                    }
                };
                tx.onerror = tx.onabort = () => {
                    setStorageError(CHAT_LOAD_ERROR);
                    setIsLoaded(true);
                    db?.close();
                };
            } catch {
                setStorageError(CHAT_LOAD_ERROR);
                setIsLoaded(true);
                db?.close();
            }
        })();
    }, [setActiveId]);

    const active = conversations.find(c => c.id === activeId) || null;
    const messages = active?.messages || [];

    const persist = useCallback((conv: Conversation): Promise<void> => {
        // Serialize snapshots per conversation so an earlier user-message write
        // cannot finish after (and overwrite) the assistant completion.
        const previous = persistQueuesRef.current.get(conv.id) || Promise.resolve();
        const databaseFactory = indexedDB;
        const pending = previous
            .catch(() => {})
            .then(async () => {
                if (deletedConversationIdsRef.current.has(conv.id)) return;
                await putConversation(conv, databaseFactory);
                setStorageError(null);
            })
            .catch(() => {
                setStorageError(CHAT_SAVE_ERROR);
            });
        persistQueuesRef.current.set(conv.id, pending);
        void pending.finally(() => {
            if (persistQueuesRef.current.get(conv.id) === pending) persistQueuesRef.current.delete(conv.id);
        });
        return pending;
    }, []);

    /**
     * Returns a stable target for a new request. If the UI is on a blank
     * session, the ID is reserved synchronously; the first targeted message
     * creates the actual conversation.
     */
    const pinConversation = useCallback((): string => {
        if (activeRef.current) return activeRef.current;
        const id = createConversationId();
        setActiveId(id);
        return id;
    }, [setActiveId]);

    const getConversationMessages = useCallback((conversationId: string): ChatMessage[] => {
        return (conversationsRef.current.find(conv => conv.id === conversationId)?.messages || []).slice();
    }, []);

    const addMessageToConversation = useCallback(
        (conversationId: string, msg: Omit<ChatMessage, "timestamp" | "id"> & { id?: string }) => {
            const currentIds = new Set(
                conversationsRef.current
                    .find(conv => conv.id === conversationId)
                    ?.messages.map(message => message.id) || []
            );
            const requestedId = msg.id?.trim();
            const message: ChatMessage = {
                ...msg,
                id: requestedId && !currentIds.has(requestedId) ? requestedId : createChatMessageId(),
                timestamp: Date.now(),
            };

            // Explicit deletion wins over a late async completion.
            if (deletedConversationIdsRef.current.has(conversationId)) return message;

            setConversations(prev => {
                let convs = [...prev];
                let conv = convs.find(item => item.id === conversationId);

                if (!conv) {
                    conv = {
                        id: conversationId,
                        title: msg.role === "user" ? titleFrom(msg.content) : "New chat",
                        messages: [message],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    convs = [conv, ...convs];
                } else {
                    const repaired = ensureUniqueMessageIds(conv.messages);
                    const existingIds = new Set(repaired.messages.map(item => item.id));
                    const safeMessage = existingIds.has(message.id)
                        ? { ...message, id: createChatMessageId() }
                        : message;
                    conv = {
                        ...conv,
                        messages: [...repaired.messages, safeMessage],
                        updatedAt: Date.now(),
                        title: conv.title === "New chat" && msg.role === "user" ? titleFrom(msg.content) : conv.title,
                    };
                    convs = convs.map(item => (item.id === conversationId ? conv! : item));
                }

                conversationsRef.current = convs;
                void persist(conv);
                return convs;
            });

            return message;
        },
        [persist]
    );

    const addMessage = useCallback(
        (msg: Omit<ChatMessage, "timestamp" | "id"> & { id?: string }) => {
            return addMessageToConversation(activeRef.current || pinConversation(), msg);
        },
        [addMessageToConversation, pinConversation]
    );

    const updateMessageInConversation = useCallback(
        (conversationId: string, messageId: string, update: Partial<ChatMessage>) => {
            setConversations(prev => {
                let updated: Conversation | undefined;
                const convs = prev.map(conv => {
                    if (conv.id !== conversationId || !conv.messages.some(message => message.id === messageId)) {
                        return conv;
                    }
                    updated = {
                        ...conv,
                        messages: conv.messages.map(message =>
                            message.id === messageId ? { ...message, ...update, id: message.id } : message
                        ),
                        updatedAt: Date.now(),
                    };
                    return updated;
                });
                conversationsRef.current = convs;
                if (updated) void persist(updated);
                return convs;
            });
        },
        [persist]
    );

    const updateMessage = useCallback(
        (messageId: string, update: Partial<ChatMessage>) => {
            const conversationId = activeRef.current;
            if (conversationId) updateMessageInConversation(conversationId, messageId, update);
        },
        [updateMessageInConversation]
    );

    const newConversation = useCallback(() => setActiveId(null), [setActiveId]);

    const switchConversation = useCallback((id: string) => setActiveId(id), [setActiveId]);

    /**
     * Branch: creates a new conversation seeded with all messages up to and
     * including the message identified by `messageId`, then switches to it.
     * Returns the new conversation ID.
     */
    const branchFrom = useCallback(
        (messageId: string): string => {
            const id = activeRef.current;
            const sourceConv = conversations.find(c => c.id === id);
            if (!sourceConv) return "";

            const cutIdx = sourceConv.messages.findIndex(m => m.id === messageId);
            if (cutIdx === -1) return "";

            const slicedMessages = sourceConv.messages.slice(0, cutIdx + 1);
            const newId = createConversationId();
            const firstUserMsg = slicedMessages.find(m => m.role === "user");
            const repaired = ensureUniqueMessageIds(slicedMessages.map(m => ({ ...m })));
            const branchConv: Conversation = {
                id: newId,
                title: `Branch: ${firstUserMsg ? titleFrom(firstUserMsg.content) : "conversation"}`,
                messages: repaired.messages,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            setConversations(prev => {
                const next = [branchConv, ...prev];
                conversationsRef.current = next;
                return next;
            });
            void persist(branchConv);
            setActiveId(newId);
            return newId;
        },
        [conversations, persist, setActiveId]
    );

    const deleteConversation = useCallback(
        async (id: string) => {
            const wasActive = activeRef.current === id;
            deletedConversationIdsRef.current.add(id);
            if (wasActive) setActiveId(null);

            await persistQueuesRef.current.get(id);
            let db: IDBDatabase | null = null;
            try {
                db = await openDB();
                await new Promise<void>((resolve, reject) => {
                    const tx = db!.transaction(STORE, "readwrite");
                    tx.oncomplete = () => resolve();
                    tx.onerror = tx.onabort = () => reject(tx.error);
                    tx.objectStore(STORE).delete(id);
                });
                setConversations(prev => {
                    const next = prev.filter(c => c.id !== id);
                    conversationsRef.current = next;
                    return next;
                });
                setStorageError(null);
            } catch {
                deletedConversationIdsRef.current.delete(id);
                // A failed durable delete must not strand a still-existing
                // conversation off-screen. Do not override a different chat
                // the user selected while the transaction was pending.
                if (wasActive && activeRef.current === null) setActiveId(id);
                setStorageError(CHAT_DELETE_ERROR);
            } finally {
                db?.close();
            }
        },
        [setActiveId]
    );

    return {
        conversations,
        activeId,
        messages,
        isLoaded,
        storageError,
        activeConversation: active,
        pinConversation,
        getConversationMessages,
        addMessage,
        addMessageToConversation,
        updateMessage,
        updateMessageInConversation,
        newConversation,
        switchConversation,
        deleteConversation,
        branchFrom,
    };
}
