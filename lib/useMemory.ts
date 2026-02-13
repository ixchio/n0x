"use client";

import { useState, useCallback, useEffect } from "react";

// RAG Memory System with IndexedDB
// Uses TF-IDF style embedding (better than trigrams, still offline)

interface Memory {
    id: string;
    content: string;
    embedding: number[];
    timestamp: number;
    tags: string[];
}

const DB_NAME = "voidchat_memory";
const STORE_NAME = "memories";

// TF-IDF style embedding (works offline, no API)
function embed(text: string): number[] {
    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2);

    // Word frequency
    const freq: Record<string, number> = {};
    for (const word of words) {
        freq[word] = (freq[word] || 0) + 1;
    }

    // Create 512-dim vector using word hashing
    const vector = new Array(512).fill(0);
    for (const [word, count] of Object.entries(freq)) {
        // Hash word to multiple indices (reduces collision)
        for (let i = 0; i < 3; i++) {
            let hash = 0;
            for (let j = 0; j < word.length; j++) {
                hash = ((hash << 5) - hash + word.charCodeAt(j) * (i + 1)) | 0;
            }
            const idx = Math.abs(hash) % 512;
            vector[idx] += count * Math.log(1 + count);
        }
    }

    // L2 normalize
    const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
    return vector.map(v => v / mag);
}

function similarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
    });
}

export function useMemory() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load on mount
    useEffect(() => {
        (async () => {
            let db: IDBDatabase | null = null;
            try {
                db = await openDB();
                const tx = db.transaction(STORE_NAME, "readonly");
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onsuccess = () => {
                    setMemories(req.result || []);
                    setIsLoaded(true);
                    db?.close();
                };
                tx.onerror = () => { setIsLoaded(true); db?.close(); };
            } catch {
                setIsLoaded(true);
                db?.close();
            }
        })();
    }, []);

    const saveMemory = useCallback(async (content: string, tags: string[] = []) => {
        const memory: Memory = {
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            content,
            embedding: embed(content),
            timestamp: Date.now(),
            tags,
        };

        let db: IDBDatabase | null = null;
        try {
            db = await openDB();
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).add(memory);
            tx.oncomplete = () => db?.close();
            tx.onerror = () => db?.close();
            setMemories(prev => [...prev, memory]);
            return memory;
        } catch {
            db?.close();
            return null;
        }
    }, []);

    const deleteMemory = useCallback(async (id: string) => {
        let db: IDBDatabase | null = null;
        try {
            db = await openDB();
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => db?.close();
            tx.onerror = () => db?.close();
            setMemories(prev => prev.filter(m => m.id !== id));
        } catch {
            db?.close();
        }
    }, []);

    const searchMemories = useCallback((query: string, limit = 5): Memory[] => {
        const queryEmb = embed(query);
        return memories
            .map(m => ({ m, score: similarity(queryEmb, m.embedding) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .filter(x => x.score > 0.15)
            .map(x => x.m);
    }, [memories]);

    const getContext = useCallback((query: string): string => {
        const relevant = searchMemories(query, 3);
        if (relevant.length === 0) return "";
        return "Relevant context:\n" + relevant.map(m => `- ${m.content}`).join("\n");
    }, [searchMemories]);

    return {
        memories,
        isLoaded,
        saveMemory,
        deleteMemory,
        searchMemories,
        getContext,
    };
}
