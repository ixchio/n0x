"use client";

import { useState, useCallback, useEffect } from "react";

interface Memory {
    id: string;
    content: string;
    embedding: number[];
    keywords: string[]; // Extracted keywords for fallback search
    timestamp: number;
    tags: string[];
}

const DB_NAME = "voidchat_memory";
const STORE_NAME = "memories";

const STOP_WORDS = new Set([
    "the", "is", "at", "which", "on", "a", "an", "and", "or", "but",
    "in", "with", "to", "for", "of", "not", "no", "can", "had", "has",
    "have", "was", "were", "will", "would", "could", "should", "been",
    "from", "are", "this", "that", "these", "those", "it", "its",
    "they", "them", "their", "what", "how", "when", "where", "who",
    "why", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "than", "too", "very", "just", "about",
    "into", "over", "after", "before", "between", "under", "above",
    "out", "off", "up", "down", "then", "once", "here", "there",
    "also", "did", "do", "does", "done", "got", "get", "gets",
    "you", "your", "our", "we", "my", "me", "him", "her", "his",
]);

function tokenize(text: string): string[] {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function extractKeywords(text: string): string[] {
    const words = tokenize(text);
    const freq: Record<string, number> = {};
    for (const word of words) {
        freq[word] = (freq[word] || 0) + 1;
    }
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word]) => word);
}

// Improved embedding: bigram + trigram + unigram with IDF-like weighting
function embed(text: string): number[] {
    const words = tokenize(text);

    // Build unigrams, bigrams, trigrams
    const ngrams: string[] = [...words]; // unigrams
    for (let i = 0; i < words.length - 1; i++) {
        ngrams.push(`${words[i]}_${words[i + 1]}`); // bigrams
    }
    for (let i = 0; i < words.length - 2; i++) {
        ngrams.push(`${words[i]}_${words[i + 1]}_${words[i + 2]}`); // trigrams
    }

    // Frequency counting
    const freq: Record<string, number> = {};
    for (const ng of ngrams) {
        freq[ng] = (freq[ng] || 0) + 1;
    }

    // Create 1024-dim vector using multi-hash (less collision than 512)
    const DIM = 1024;
    const vector = new Array(DIM).fill(0);

    for (const [ngram, count] of Object.entries(freq)) {
        // Use 4 hash functions per ngram (reduces collision)
        for (let h = 0; h < 4; h++) {
            let hash = h * 31;
            for (let j = 0; j < ngram.length; j++) {
                hash = ((hash << 5) - hash + ngram.charCodeAt(j) * (h + 1)) | 0;
            }
            const idx = Math.abs(hash) % DIM;
            // TF-IDF-like weight: log(1 + count) * ngram_type_weight
            const isNgram = ngram.includes("_");
            const weight = isNgram ? 1.5 : 1.0; // Boost n-grams
            const sign = (hash & 1) ? 1 : -1; // Random sign for better distribution
            vector[idx] += sign * count * Math.log(1 + count) * weight;
        }
    }

    // L2 normalize
    const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
    return vector.map(v => v / mag);
}

function similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

// Keyword-based fallback similarity (Jaccard-like)
function keywordSimilarity(queryKeywords: string[], memoryKeywords: string[]): number {
    if (queryKeywords.length === 0 || memoryKeywords.length === 0) return 0;
    const memSet = new Set(memoryKeywords);
    let overlap = 0;
    for (const k of queryKeywords) {
        if (memSet.has(k)) overlap++;
    }
    return overlap / Math.max(queryKeywords.length, memoryKeywords.length);
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 2); // Bump version for schema update
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
                    const mems = (req.result || []).map((m: any) => ({
                        ...m,
                        keywords: m.keywords || extractKeywords(m.content),
                    }));
                    setMemories(mems);
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
            keywords: extractKeywords(content),
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
        if (memories.length === 0) return [];

        const queryEmb = embed(query);
        const queryKeywords = extractKeywords(query);

        // Precompute threshold to avoid creating thousands of objects if unneeded
        // Score using BOTH vector similarity AND keyword matching
        const scored: { m: Memory, score: number }[] = [];

        for (let i = 0; i < memories.length; i++) {
            const m = memories[i];
            const vecScore = similarity(queryEmb, m.embedding);

            // Fast exit: if vector is terrible, skip keyword calc
            if (vecScore < 0.01) continue;

            const kwScore = keywordSimilarity(queryKeywords, m.keywords || []);
            const combined = vecScore * 0.6 + kwScore * 0.4;

            if (combined > 0.03) {
                scored.push({ m, score: combined });
            }
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(x => x.m);
    }, [memories]);

    const getContext = useCallback((query: string): string => {
        const relevant = searchMemories(query, 5);
        if (relevant.length === 0) return "";
        return "Relevant memories from past conversations:\n" +
            relevant.map(m => `- [${new Date(m.timestamp).toLocaleDateString()}] ${m.content}`).join("\n");
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
