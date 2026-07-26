// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitationEvidence } from "@/components/chat/citation-evidence";

describe("inspectable document evidence", () => {
    it("shows the exact persisted passage in an accessible, dismissible dialog", () => {
        render(
            <CitationEvidence
                citations={[
                    {
                        documentId: "sha256-policy",
                        documentName: "retention-policy.pdf",
                        chunkIndex: 3,
                        text: "Customer records are retained for exactly 30 days after account closure.",
                        relevance: { vector: 0.7, bm25: 2.1, fused: 0.03 },
                    },
                ]}
            />
        );

        const citation = screen.getByRole("button", { name: "[retention-policy.pdf#chunk-3]" });
        fireEvent.click(citation);
        expect(screen.getByRole("dialog", { name: "[retention-policy.pdf#chunk-3]" })).toBeTruthy();
        expect(screen.getByText(/Customer records are retained for exactly 30 days/)).toBeTruthy();

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(citation);
    });
});
