// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsOverlay } from "@/components/chat/metrics-overlay";

describe("MetricsOverlay", () => {
    it("describes cloud telemetry without claiming WebGPU or fabricated hardware metrics", () => {
        render(
            <MetricsOverlay
                provider="cloud"
                tps={42}
                modelName="remote-model"
                isLoaded
                isLoading={false}
                progress={0}
                isOpen
                onToggle={vi.fn()}
            />
        );

        expect(screen.getByText("CONFIGURED (CLOUD API)")).toBeTruthy();
        expect(screen.getByText("Remote API")).toBeTruthy();
        expect(screen.getByText("Cloud provider")).toBeTruthy();
        expect(screen.queryByText(/WebGPU/i)).toBeNull();
        expect(screen.queryByText(/VRAM|Latency|15ms/i)).toBeNull();
    });

    it("sets accurate expectations for cached browser model weights", () => {
        render(
            <MetricsOverlay
                provider="browser"
                tps={0}
                modelName="local-model"
                isLoaded={false}
                isLoading
                progress={0.5}
                isOpen
                onToggle={vi.fn()}
            />
        );

        expect(screen.getByText("LOADING WEIGHTS")).toBeTruthy();
        expect(screen.getByText(/still need initialization/i)).toBeTruthy();
        expect(screen.getByText(/storage may evict/i)).toBeTruthy();
    });

    it("does not assume a configured Ollama endpoint is loopback", () => {
        render(
            <MetricsOverlay
                provider="ollama"
                tps={0}
                modelName="llama"
                isLoaded
                isLoading={false}
                progress={0}
                isOpen
                onToggle={vi.fn()}
            />
        );

        expect(screen.getByText("Configured endpoint")).toBeTruthy();
        expect(screen.queryByText("Local network")).toBeNull();
    });
});
