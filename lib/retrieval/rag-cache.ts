export const DB_NAME = "n0x_rag_cache";
export const STORE_NAME = "vectors";

const DB_VERSION = 2;
export const CACHE_VERSION = 3;

export interface CachedChunkEntry {
    documentId: string;
    documentName: string;
    chunkIndex: number;
    text: string;
    embedding: number[];
}

export interface CachedRagData {
    version: number;
    chunks: [string, CachedChunkEntry][];
    timestamp: number;
}

interface StoredRagData {
    id: string;
    data: CachedRagData;
}

export async function createDocumentId(file: Pick<Blob, "arrayBuffer">): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error("SHA-256 is unavailable in this browser context");
    }

    const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    return `sha256-${hex}`;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error ?? new Error("Could not open the RAG cache"));
        request.onblocked = () => reject(new Error("Opening the RAG cache was blocked"));
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;

            // Version 1 used metadata-derived keys and could retain collisions. Recreate
            // the disposable cache during the one-time upgrade instead of carrying those
            // records into the content-addressed schema.
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
    });
}

function isCachedChunkEntry(value: unknown): value is CachedChunkEntry {
    if (!value || typeof value !== "object") return false;
    const entry = value as Partial<CachedChunkEntry>;
    return (
        typeof entry.documentId === "string" &&
        typeof entry.documentName === "string" &&
        Number.isInteger(entry.chunkIndex) &&
        (entry.chunkIndex ?? 0) > 0 &&
        typeof entry.text === "string" &&
        Array.isArray(entry.embedding) &&
        entry.embedding.every(component => typeof component === "number" && Number.isFinite(component))
    );
}

function isCachedRagData(value: unknown): value is CachedRagData {
    if (!value || typeof value !== "object") return false;
    const data = value as Partial<CachedRagData>;
    return (
        data.version === CACHE_VERSION &&
        typeof data.timestamp === "number" &&
        Array.isArray(data.chunks) &&
        data.chunks.every(
            item =>
                Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && isCachedChunkEntry(item[1])
        )
    );
}

export async function getCachedVectors(fileId: string): Promise<CachedRagData | null> {
    const db = await openDB();
    try {
        const record = await new Promise<StoredRagData | undefined>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const request = transaction.objectStore(STORE_NAME).get(fileId);
            request.onsuccess = () => resolve(request.result as StoredRagData | undefined);
            request.onerror = () => reject(request.error ?? new Error("Could not read the RAG cache"));
            transaction.onabort = () => reject(transaction.error ?? new Error("RAG cache read was aborted"));
        });

        return isCachedRagData(record?.data) ? record.data : null;
    } finally {
        db.close();
    }
}

export async function saveVectorsToCache(fileId: string, chunks: [string, CachedChunkEntry][]): Promise<void> {
    const db = await openDB();
    try {
        const data: CachedRagData = {
            version: CACHE_VERSION,
            chunks,
            timestamp: Date.now(),
        };

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put({ id: fileId, data } satisfies StoredRagData);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Could not write the RAG cache"));
            transaction.onabort = () => reject(transaction.error ?? new Error("RAG cache write was aborted"));
        });
    } finally {
        db.close();
    }
}

export async function deleteVectorsFromCache(fileId: string): Promise<void> {
    const db = await openDB();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).delete(fileId);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete from the RAG cache"));
            transaction.onabort = () => reject(transaction.error ?? new Error("RAG cache deletion was aborted"));
        });
    } finally {
        db.close();
    }
}

export async function clearVectorsCache(): Promise<void> {
    const db = await openDB();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear the RAG cache"));
            transaction.onabort = () => reject(transaction.error ?? new Error("RAG cache clear was aborted"));
        });
    } finally {
        db.close();
    }
}
