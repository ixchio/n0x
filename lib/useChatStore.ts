"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    image?: string;
    timestamp: number;
}

interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

const DB_NAME = "n0x_chat";
const DB_VER = 1;
const STORE = "conversations";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE)) {
                const s = db.createObjectStore(STORE, { keyPath: "id" });
                s.createIndex("updatedAt", "updatedAt", { unique: false });
            }
        };
    });
}

function titleFrom(text: string): string {
    const s = text.replace(/\n/g, " ").trim();
    return s.length > 40 ? s.slice(0, 40) + "..." : s;
}

export function useChatStore() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, _setActiveId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // keep a ref so addMessage always sees the latest activeId
    // without waiting for a React re-render cycle
    const activeRef = useRef<string | null>(null);
    const setActiveId = useCallback((id: string | null) => {
        activeRef.current = id;
        _setActiveId(id);
    }, []);

    useEffect(() => {
        (async () => {
            let db: IDBDatabase | null = null;
            try {
                db = await openDB();
                const tx = db.transaction(STORE, "readonly");
                const req = tx.objectStore(STORE).getAll();
                req.onsuccess = () => {
                    const all = (req.result || []).sort((a: Conversation, b: Conversation) => b.updatedAt - a.updatedAt);
                    setConversations(all);
                    if (all.length > 0) setActiveId(all[0].id);
                    setIsLoaded(true);
                    db?.close();
                };
                tx.onerror = () => { setIsLoaded(true); db?.close(); };
            } catch {
                setIsLoaded(true);
                db?.close();
            }
        })();
    }, [setActiveId]);

    const active = conversations.find(c => c.id === activeId) || null;
    const messages = active?.messages || [];

    const persist = useCallback(async (conv: Conversation) => {
        let db: IDBDatabase | null = null;
        try {
            db = await openDB();
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(conv);
            tx.oncomplete = () => db?.close();
            tx.onerror = () => db?.close();
        } catch {
            db?.close();
        }
    }, []);

    const addMessage = useCallback((msg: Omit<ChatMessage, "timestamp">) => {
        const message: ChatMessage = { ...msg, timestamp: Date.now() };

        setConversations(prev => {
            let convs = [...prev];
            // use the ref — always has the freshest value
            let conv = convs.find(c => c.id === activeRef.current);

            if (!conv) {
                const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                conv = {
                    id,
                    title: msg.role === "user" ? titleFrom(msg.content) : "New chat",
                    messages: [message],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                convs = [conv, ...convs];
                // sync ref immediately so the next addMessage finds this conv
                setActiveId(id);
            } else {
                conv = {
                    ...conv,
                    messages: [...conv.messages, message],
                    updatedAt: Date.now(),
                    title: conv.messages.length === 0 && msg.role === "user" ? titleFrom(msg.content) : conv.title,
                };
                convs = convs.map(c => c.id === conv!.id ? conv! : c);
            }

            persist(conv);
            return convs;
        });

        return message;
    }, [persist, setActiveId]);

    const updateMessage = useCallback((messageId: string, update: Partial<ChatMessage>) => {
        setConversations(prev => {
            const id = activeRef.current;
            const convs = prev.map(conv => {
                if (conv.id !== id) return conv;
                return {
                    ...conv,
                    messages: conv.messages.map(m => m.id === messageId ? { ...m, ...update } : m),
                    updatedAt: Date.now(),
                };
            });
            const updated = convs.find(c => c.id === id);
            if (updated) persist(updated);
            return convs;
        });
    }, [persist]);

    const newConversation = useCallback(() => setActiveId(null), [setActiveId]);

    const switchConversation = useCallback((id: string) => setActiveId(id), [setActiveId]);

    const deleteConversation = useCallback(async (id: string) => {
        let db: IDBDatabase | null = null;
        try {
            db = await openDB();
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = () => db?.close();
            tx.onerror = () => db?.close();
        } catch {
            db?.close();
        }
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeRef.current === id) setActiveId(null);
    }, [setActiveId]);

    return {
        conversations, activeId, messages, isLoaded,
        activeConversation: active,
        addMessage, updateMessage,
        newConversation, switchConversation, deleteConversation,
    };
}
