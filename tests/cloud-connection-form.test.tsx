// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudConnectionForm } from "@/components/chat/workbench/cloud-connection-form";
import { useCloudAI } from "@/lib/providers/useCloudAI";

const baseProps = {
    apiKey: "groq-key",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile"],
    loadedModel: "llama-3.3-70b-versatile",
    fetchingModels: false,
    onSave: vi.fn(),
    onRefresh: vi.fn(),
    onModelChange: vi.fn(),
};

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
});

describe("Cloud connection form", () => {
    it("stages provider and key edits until an explicit save", () => {
        const onSave = vi.fn();
        render(<CloudConnectionForm {...baseProps} onSave={onSave} />);

        fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openrouter" } });
        expect(onSave).not.toHaveBeenCalled();
        expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe("https://openrouter.ai/api/v1");
        expect((screen.getByLabelText("API Key") as HTMLInputElement).value).toBe("");

        fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "openrouter-key" } });
        fireEvent.click(screen.getByRole("button", { name: "Save & test connection" }));

        expect(onSave).toHaveBeenCalledExactlyOnceWith("https://openrouter.ai/api/v1", "openrouter-key");
    });

    it("does not reuse a saved key against a manually changed host", () => {
        const onSave = vi.fn();
        render(<CloudConnectionForm {...baseProps} onSave={onSave} />);

        fireEvent.change(screen.getByLabelText("Base URL"), {
            target: { value: "https://compatible.example/v1" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save & test connection" }));

        expect(onSave).not.toHaveBeenCalled();
        expect((screen.getByLabelText("API Key") as HTMLInputElement).value).toBe("");
        expect(screen.getByRole("alert").textContent).toMatch(/paste the API key for this provider/i);
    });

    it("links to the selected provider's own key page", () => {
        render(<CloudConnectionForm {...baseProps} />);

        const groqLink = screen.getByRole("link", { name: "Groq keys →" });
        expect(groqLink.getAttribute("href")).toBe("https://console.groq.com/keys");

        fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });
        expect(screen.getByRole("link", { name: "OpenAI keys →" }).getAttribute("href")).toBe(
            "https://platform.openai.com/api-keys"
        );
    });

    it("persists session credentials as JSON without writing them to local storage", () => {
        useCloudAI.setState({
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "session-only-key",
            loadedModel: "text-chat-model",
        });

        const saved = JSON.parse(sessionStorage.getItem("n0x-cloud-storage") || "null");
        expect(saved.state).toEqual({
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "session-only-key",
            loadedModel: "text-chat-model",
        });
        expect(localStorage.getItem("n0x-cloud-storage")).toBeNull();
    });
});
