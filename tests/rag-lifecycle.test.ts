// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface WorkerMessage {
    id: number;
    action: string;
    payload: unknown;
}

class ControlledRagWorker {
    static instance: ControlledRagWorker | null = null;
    static instances: ControlledRagWorker[] = [];

    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    messages: WorkerMessage[] = [];
    terminated = false;

    constructor() {
        ControlledRagWorker.instance = this;
        ControlledRagWorker.instances.push(this);
    }

    postMessage(message: WorkerMessage) {
        this.messages.push(message);
    }

    respond(action: string, result: unknown) {
        const message = this.messages.find(candidate => candidate.action === action);
        if (!message) throw new Error(`No ${action} worker message`);
        this.messages = this.messages.filter(candidate => candidate !== message);
        this.onmessage?.({ data: { id: message.id, result, done: true } } as MessageEvent);
    }

    fail(action: string, error: string) {
        const message = this.messages.find(candidate => candidate.action === action);
        if (!message) throw new Error(`No ${action} worker message`);
        this.messages = this.messages.filter(candidate => candidate !== message);
        this.onmessage?.({ data: { id: message.id, error, done: true } } as MessageEvent);
    }

    terminate() {
        this.terminated = true;
    }
}

const document = {
    id: "sha256-policy",
    name: "retention-policy.pdf",
    size: 12_000,
    type: "application/pdf",
    chunks: 3,
    rawText: "",
};

describe("RAG document lifecycle", () => {
    beforeEach(() => {
        vi.resetModules();
        ControlledRagWorker.instance = null;
        ControlledRagWorker.instances = [];
        vi.stubGlobal("Worker", ControlledRagWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("keeps a document visible until persistent removal commits", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({ documents: [document], pendingFiles: [document] });

        const removal = useRAG.getState().removeFile(document.id);

        expect(useRAG.getState().documents).toEqual([document]);
        expect(useRAG.getState().status).toMatch(/removing document/i);

        ControlledRagWorker.instance?.respond("REMOVE_FILE", true);
        await expect(removal).resolves.toBe(true);

        expect(useRAG.getState().documents).toEqual([]);
        expect(useRAG.getState().pendingFiles).toEqual([]);
        expect(useRAG.getState().storageError).toBeNull();
    });

    it("commits a durable delete before detaching a direct-only document", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        const directDocument = { ...document, chunks: 1, rawText: "small direct document" };
        useRAG.setState({ documents: [directDocument], pendingFiles: [directDocument] });

        const removal = useRAG.getState().removeFile(directDocument.id);

        expect(useRAG.getState().documents).toEqual([directDocument]);
        expect(ControlledRagWorker.instance?.messages).toContainEqual(
            expect.objectContaining({ action: "REMOVE_FILE", payload: { fileKey: directDocument.id } })
        );
        ControlledRagWorker.instance?.respond("REMOVE_FILE", true);
        await expect(removal).resolves.toBe(true);
        expect(useRAG.getState().documents).toEqual([]);
    });

    it("keeps UI state truthful and surfaces a content-free error when removal fails", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({ documents: [document], pendingFiles: [document] });

        const removal = useRAG.getState().removeFile(document.id);
        ControlledRagWorker.instance?.fail("REMOVE_FILE", "Quota failure for retention-policy.pdf");

        await expect(removal).resolves.toBe(false);
        expect(useRAG.getState().documents).toEqual([document]);
        expect(useRAG.getState().pendingFiles).toEqual([document]);
        expect(useRAG.getState().storageError).toMatch(/still attached/i);
        expect(useRAG.getState().storageError).not.toContain(document.name);
    });

    it("collapses identical content IDs into one attachment with explicit status", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        const file = new File(["same bytes"], "notes.txt", { type: "text/plain" });
        const indexed = { ...document, id: "sha256-same", name: file.name, size: file.size, chunks: 1 };

        const first = useRAG.getState().addFile(file);
        await Promise.resolve();
        ControlledRagWorker.instance?.respond("ADD_FILE", indexed);
        await first;

        const duplicate = useRAG.getState().addFile(file);
        await Promise.resolve();
        ControlledRagWorker.instance?.respond("ADD_FILE", indexed);
        await duplicate;

        expect(useRAG.getState().documents).toEqual([indexed]);
        expect(useRAG.getState().pendingFiles).toEqual([indexed]);
        expect(useRAG.getState().status).toMatch(/already attached.*duplicate content/i);
    });

    it("serializes multiple selected files instead of silently dropping later files", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        const firstFile = new File(["first"], "first.txt", { type: "text/plain" });
        const secondFile = new File(["second"], "second.txt", { type: "text/plain" });
        const firstDoc = { ...document, id: "sha256-first", name: firstFile.name, size: firstFile.size };
        const secondDoc = { ...document, id: "sha256-second", name: secondFile.name, size: secondFile.size };

        const first = useRAG.getState().addFile(firstFile);
        const second = useRAG.getState().addFile(secondFile);
        await Promise.resolve();
        expect(ControlledRagWorker.instance?.messages.filter(message => message.action === "ADD_FILE")).toHaveLength(1);

        ControlledRagWorker.instance?.respond("ADD_FILE", firstDoc);
        await first;
        await Promise.resolve();
        expect(ControlledRagWorker.instance?.messages.filter(message => message.action === "ADD_FILE")).toHaveLength(1);
        ControlledRagWorker.instance?.respond("ADD_FILE", secondDoc);

        await expect(second).resolves.toBe(true);
        expect(useRAG.getState().documents).toEqual([firstDoc, secondDoc]);
        expect(useRAG.getState().isIndexing).toBe(false);
    });

    it("does not let queued indexing resurrect documents after clear", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        const firstFile = new File(["first"], "first.txt", { type: "text/plain" });
        const secondFile = new File(["second"], "second.txt", { type: "text/plain" });
        const firstDoc = { ...document, id: "sha256-first", name: firstFile.name, size: firstFile.size };

        const first = useRAG.getState().addFile(firstFile);
        const second = useRAG.getState().addFile(secondFile);
        await Promise.resolve();
        const clearing = useRAG.getState().clear();

        ControlledRagWorker.instance?.respond("ADD_FILE", firstDoc);
        await expect(first).resolves.toBe(false);
        ControlledRagWorker.instance?.respond("CLEAR", true);
        await expect(clearing).resolves.toBe(true);
        await expect(second).resolves.toBe(false);

        expect(useRAG.getState().documents).toEqual([]);
        expect(useRAG.getState().isIndexing).toBe(false);
        expect(ControlledRagWorker.instance?.messages.some(message => message.action === "ADD_FILE")).toBe(false);
    });

    it("does not clear attachments until durable cache clearing succeeds", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({ documents: [document], pendingFiles: [document] });

        const clearing = useRAG.getState().clear();
        expect(useRAG.getState().documents).toEqual([document]);

        ControlledRagWorker.instance?.fail("CLEAR", "IndexedDB blocked");
        await expect(clearing).resolves.toBe(false);
        expect(useRAG.getState().documents).toEqual([document]);
        expect(useRAG.getState().storageError).toMatch(/still attached/i);
    });

    it("clears the durable vector cache even when no attachments were hydrated after reload", async () => {
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({ documents: [], pendingFiles: [], isIndexing: false });

        const clearing = useRAG.getState().clear();

        expect(ControlledRagWorker.instance?.messages.some(message => message.action === "CLEAR")).toBe(true);
        ControlledRagWorker.instance?.respond("CLEAR", true);
        await expect(clearing).resolves.toBe(true);
        expect(useRAG.getState().storageError).toBeNull();
    });

    it("terminates a timed-out worker and ignores its late deletion result", async () => {
        vi.useFakeTimers();
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({ documents: [document], pendingFiles: [document] });

        const removal = useRAG.getState().removeFile(document.id);
        const timedOutWorker = ControlledRagWorker.instance;
        await vi.advanceTimersByTimeAsync(60_000);

        await expect(removal).resolves.toBe(false);
        expect(timedOutWorker?.terminated).toBe(true);
        expect(useRAG.getState().documents).toEqual([document]);

        timedOutWorker?.respond("REMOVE_FILE", true);
        await Promise.resolve();
        expect(useRAG.getState().documents).toEqual([document]);

        const retry = useRAG.getState().removeFile(document.id);
        expect(ControlledRagWorker.instances).toHaveLength(2);
        expect(ControlledRagWorker.instance).not.toBe(timedOutWorker);
        ControlledRagWorker.instance?.respond("REMOVE_FILE", true);
        await expect(retry).resolves.toBe(true);
        expect(useRAG.getState().documents).toEqual([]);
    });
});
