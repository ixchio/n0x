// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExecutionMessages } from "@/lib/chat/executionPrompt";
import {
    NO_RAG_EVIDENCE,
    calculateBm25Scores,
    formatRagEvidence,
    hasSufficientEvidence,
    type RAGSearchResult,
} from "@/lib/retrieval/rag-evidence";

const typedEvidence: RAGSearchResult = {
    documentId: "sha256-policy",
    documentName: "policy.pdf",
    chunkIndex: 3,
    text: "The retention period is thirty days after account closure.",
    relevance: { vector: 0.67, bm25: 2.4, fused: 0.032 },
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe("RAG evidence quality", () => {
    it("rejects relative-only rankings while accepting semantic, lexical, and whole-document evidence", () => {
        expect(
            hasSufficientEvidence("capital of France", "Unrelated notes about marine biology.", {
                vector: 0.12,
                bm25: 0,
                fused: 0.033,
            })
        ).toBe(false);

        expect(
            hasSufficientEvidence("capital of France", "Paris is the capital of France.", {
                vector: 0.1,
                bm25: 1.2,
                fused: 0.02,
            })
        ).toBe(true);

        expect(
            hasSufficientEvidence("renewal conditions", "The subscription continues under the stated terms.", {
                vector: 0.31,
                bm25: 0,
                fused: 0.016,
            })
        ).toBe(true);

        expect(
            hasSufficientEvidence("Summarize the uploaded document", "A document passage without query terms.", {
                vector: null,
                bm25: null,
                fused: null,
            })
        ).toBe(true);
    });

    it("returns BM25 relevance and formats exact filename/chunk citations for the prompt", () => {
        const scores = calculateBm25Scores("retention period", [
            { id: "relevant", text: typedEvidence.text },
            { id: "irrelevant", text: "A recipe for tomato soup." },
        ]);
        expect(scores.get("relevant")).toBeGreaterThan(0);
        expect(scores.get("irrelevant")).toBe(0);

        const context = formatRagEvidence([typedEvidence]);
        expect(context).toContain("[policy.pdf#chunk-3]");
        expect(context).not.toContain("[Excerpt 1]");

        const messages = buildExecutionMessages({
            plan: { contextBudget: 3_500 },
            message: "What is the retention period?",
            systemContent: "Be accurate.",
            history: [],
            ragCtx: context,
            memCtx: "",
            searchCtx: "",
            fileNames: ["policy.pdf"],
        });
        expect(messages.at(-1)?.content).toContain("[filename#chunk-N]");
        expect(messages.at(-1)?.content).toContain("[policy.pdf#chunk-3]");
    });

    it("passes typed worker evidence through useRAG and emits an explicit no-evidence result", async () => {
        let workerResults: RAGSearchResult[] = [typedEvidence];

        class FakeWorker {
            onmessage: ((event: { data: unknown }) => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;

            postMessage(message: { id: number; action: string }) {
                queueMicrotask(() => {
                    this.onmessage?.({
                        data: {
                            id: message.id,
                            result: message.action === "SEARCH" ? workerResults : true,
                            done: true,
                        },
                    });
                });
            }

            terminate() {}
        }

        vi.stubGlobal("Worker", FakeWorker);
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({
            documents: [
                {
                    id: typedEvidence.documentId,
                    name: typedEvidence.documentName,
                    size: 9_000,
                    type: "application/pdf",
                    chunks: 4,
                    rawText: "",
                },
            ],
            pendingFiles: [],
        });

        await expect(useRAG.getState().search("retention period", 4)).resolves.toEqual([typedEvidence]);
        await expect(useRAG.getState().getFileContext("retention period")).resolves.toContain("[policy.pdf#chunk-3]");

        workerResults = [];
        await expect(useRAG.getState().getFileContext("quantum chromodynamics")).resolves.toBe(NO_RAG_EVIDENCE);
    });

    it("applies the evidence threshold to direct small-document results", async () => {
        vi.stubGlobal("Worker", class {});
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        useRAG.setState({
            documents: [
                {
                    id: "sha256-small",
                    name: "handbook.txt",
                    size: 80,
                    type: "text/plain",
                    chunks: 1,
                    rawText: "Employees may carry over ten vacation days into the next calendar year.",
                },
            ],
            pendingFiles: [],
        });

        const relevant = await useRAG.getState().search("vacation carry over days", 4);
        expect(relevant).toMatchObject([
            {
                documentId: "sha256-small",
                documentName: "handbook.txt",
                chunkIndex: 1,
                relevance: { vector: null, fused: null },
            },
        ]);
        await expect(useRAG.getState().search("quantum chromodynamics", 4)).resolves.toEqual([]);
        await expect(useRAG.getState().getFileContext("quantum chromodynamics")).resolves.toBe(NO_RAG_EVIDENCE);
    });

    it("ranks a passage near the end of a direct document before the small-model prompt cap", async () => {
        vi.stubGlobal("Worker", class {});
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        const filler = "General policy background without the requested detail. ".repeat(125);
        const answer = "The zephyr retention code is ORCHID-SEVEN and remains valid for forty two days.";
        useRAG.setState({
            documents: [
                {
                    id: "sha256-long-direct",
                    name: "long-policy.txt",
                    size: filler.length + answer.length,
                    type: "text/plain",
                    chunks: 1,
                    rawText: filler + answer,
                },
            ],
            pendingFiles: [],
        });

        const evidence = await useRAG.getState().search("What is the zephyr retention code?", 4);
        expect(evidence[0].text).toContain("ORCHID-SEVEN");
        expect(evidence[0].chunkIndex).toBeGreaterThan(1);

        const ragCtx = await useRAG.getState().getFileContext("What is the zephyr retention code?");
        const messages = buildExecutionMessages({
            plan: { contextBudget: 3_500 },
            message: "What is the zephyr retention code?",
            systemContent: "Answer from evidence.",
            history: [],
            ragCtx,
            memCtx: "",
            searchCtx: "",
            fileNames: ["long-policy.txt"],
        });

        expect(messages.at(-1)?.content).toContain("ORCHID-SEVEN");
        expect(messages.at(-1)?.content).toContain(`[long-policy.txt#chunk-${evidence[0].chunkIndex}]`);
    });

    it("samples beginning, middle, and end evidence for a whole direct-document summary", async () => {
        vi.stubGlobal("Worker", class {});
        const { useRAG } = await import("@/lib/retrieval/useRAG");
        const rawText =
            "BEGIN-MARKER opening scope. " +
            "Routine section detail with enough words to create stable chunks. ".repeat(125) +
            " END-MARKER final conclusion.";
        useRAG.setState({
            documents: [
                {
                    id: "sha256-summary",
                    name: "annual-report.txt",
                    size: rawText.length,
                    type: "text/plain",
                    chunks: 1,
                    rawText,
                },
            ],
            pendingFiles: [],
        });

        const evidence = await useRAG.getState().search("Summarize the uploaded document", 4);
        const indices = evidence.map(result => result.chunkIndex);

        expect(evidence).toHaveLength(4);
        expect(indices[0]).toBe(1);
        expect(indices.at(-1)).toBeGreaterThan(indices[1]);
        expect(evidence[0].text).toContain("BEGIN-MARKER");
        expect(evidence.at(-1)?.text).toContain("END-MARKER");

        const ragCtx = await useRAG.getState().getFileContext("Summarize the uploaded document");
        const messages = buildExecutionMessages({
            plan: { contextBudget: 3_500 },
            message: "Summarize the uploaded document",
            systemContent: "Summarize only the evidence.",
            history: [],
            ragCtx,
            memCtx: "",
            searchCtx: "",
            fileNames: ["annual-report.txt"],
        });

        expect(messages.at(-1)?.content).toContain("BEGIN-MARKER");
        expect(messages.at(-1)?.content).toContain("END-MARKER");
    });
});
