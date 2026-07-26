// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "@/app/page";
import PrivatePdfAiPage from "@/app/private-pdf-ai/page";
import { WorkbenchEmptyState } from "@/components/chat/workbench/workbench-panels";

afterEach(() => cleanup());

describe("private document activation UI", () => {
    it("leads the landing page with the document outcome and a working sample path", () => {
        render(<HomePage />);

        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Ask confidential documents questions. Get answers tied to the source.",
            })
        ).toBeTruthy();
        expect(screen.getByText("[retention-policy.pdf#chunk-3]")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Ask a document privately" }).getAttribute("href")).toBe("/chat");
        expect(screen.getByRole("link", { name: "Try with a sample" }).getAttribute("href")).toBe("/chat?sample=1");
        expect(screen.queryByAltText(/empty state/i)).toBeNull();
    });

    it("makes the private PDF page explicit about citations, downloads, and network boundaries", () => {
        render(<PrivatePdfAiPage />);

        expect(
            screen.getByRole("heading", { level: 1, name: "Ask your PDF a question. Keep the evidence attached." })
        ).toBeTruthy();
        expect(screen.getByText("[retention-policy.pdf#chunk-3]")).toBeTruthy();
        expect(screen.getByText(/first model choice downloads roughly 360 MB–2 GB/i)).toBeTruthy();
        expect(screen.getByText(/Cloud API receives selected prompt and document context/i)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Try the sample first" }).getAttribute("href")).toBe("/chat?sample=1");
    });

    it("shows indexed-document and ready-provider progress without hiding advanced tools", () => {
        render(
            <WorkbenchEmptyState
                provider="browser"
                recommendedLabel="Qwen 2.5 1.5B"
                recommendedReason="balanced local model"
                recommendedSize="~1GB"
                localModelDisabled={false}
                providerReady
                documentCount={1}
                onAttachDocs={() => {}}
                onBestLocalModel={() => {}}
                onSampleDocDemo={() => {}}
                onSearchWeb={() => {}}
                onPrivacyInspector={() => {}}
            />
        );

        expect(screen.getByRole("heading", { name: "Document ready. Ask a cited question." })).toBeTruthy();
        expect(screen.getByText(/Write a question below and verify the answer/i)).toBeTruthy();
        expect(screen.queryByText(/prepared question below/i)).toBeNull();
        expect(screen.getByText("1. Document indexed")).toBeTruthy();
        expect(screen.getByText("2. Provider ready")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Search web" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Privacy details" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Load Qwen/i })).toBeNull();
    });
});
