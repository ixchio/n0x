// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelRuntimeStatus } from "@/components/chat/workbench/model-runtime-status";
import { WorkbenchEmptyState } from "@/components/chat/workbench/workbench-panels";
import { useWorkbenchPreferences } from "@/components/chat/workbench/use-workbench-preferences";
import { CommandMenu, hasOpenOverlay, modelSizeInGB, shouldToggleShortcuts } from "@/components/chat/command-menu";
import { waitForWebLLMGenerationToSettle } from "@/components/chat/workbench/model-switch";
import { useWebLLM } from "@/lib/providers/useWebLLM";

Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function mockMatchMedia(matches: boolean) {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const matchMedia = vi.fn().mockReturnValue({
        matches,
        media: "(min-width: 1024px)",
        onchange: null,
        addEventListener,
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMedia);
    return matchMedia;
}

describe("responsive workbench UI", () => {
    it("normalizes MB model labels before applying mobile GB thresholds", () => {
        expect(modelSizeInGB("~360MB")).toBeCloseTo(360 / 1024);
        expect(modelSizeInGB("~2.2GB")).toBe(2.2);
    });

    it("keeps the sidebar closed below the desktop breakpoint", () => {
        const matchMedia = mockMatchMedia(false);
        const { result } = renderHook(() => useWorkbenchPreferences());

        expect(matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
        expect(result.current.sidebarOpen).toBe(false);
    });

    it("docks the sidebar on desktop", async () => {
        mockMatchMedia(true);
        const { result } = renderHook(() => useWorkbenchPreferences());

        await waitFor(() => expect(result.current.sidebarOpen).toBe(true));
    });

    it("renders one mobile-friendly document path without a duplicate start strip", () => {
        const onAttachDocs = vi.fn();
        const onSampleDocDemo = vi.fn();
        render(
            <WorkbenchEmptyState
                provider="browser"
                recommendedLabel="SmolLM2 360M"
                recommendedReason="smallest local model"
                recommendedSize="~360MB"
                localModelDisabled={false}
                providerReady={false}
                documentCount={0}
                onBestLocalModel={vi.fn()}
                onAttachDocs={onAttachDocs}
                onSampleDocDemo={onSampleDocDemo}
                onSearchWeb={vi.fn()}
                onPrivacyInspector={vi.fn()}
            />
        );

        const chooseDocument = screen.getByRole("button", { name: "Choose a document" });
        expect(chooseDocument.className).toContain("min-h-11");
        expect(screen.getAllByRole("button", { name: "Choose a document" })).toHaveLength(1);
        fireEvent.click(chooseDocument);
        fireEvent.click(screen.getByRole("button", { name: "Try the sample" }));
        expect(onAttachDocs).toHaveBeenCalledOnce();
        expect(onSampleDocDemo).toHaveBeenCalledOnce();
        expect(screen.getByText("[filename#chunk-N]")).toBeTruthy();
    });

    it("announces model download progress with a numeric value", () => {
        render(
            <ModelRuntimeStatus
                provider="browser"
                webllm={{
                    error: null,
                    status: "loading",
                    isSupported: true,
                    loadProgress: 0.42,
                    loadingModel: null,
                    loadedModel: null,
                    loadModel: vi.fn(),
                }}
                messageCount={0}
                defaultModel="Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
                onModelChange={vi.fn()}
                onUseCloud={vi.fn()}
            />
        );

        expect(screen.getByRole("progressbar", { name: /Downloading/i }).getAttribute("aria-valuenow")).toBe("42");
        expect(screen.getByRole("status")).toBeTruthy();
        expect(screen.getByText("First use downloads ~1GB of model weights.")).toBeTruthy();
        expect(screen.getByText(/model initialization still takes time/i)).toBeTruthy();
    });

    it("does not offer a second model load while a download is stalled", () => {
        render(
            <ModelRuntimeStatus
                provider="browser"
                webllm={{
                    error: "Download stalled at 18%",
                    status: "loading",
                    isSupported: true,
                    loadProgress: 0.18,
                    loadingModel: null,
                    loadedModel: null,
                    loadModel: vi.fn(),
                }}
                messageCount={0}
                defaultModel="Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
                onModelChange={vi.fn()}
                onUseCloud={vi.fn()}
            />
        );

        expect(screen.queryByRole("button", { name: /Try smaller model/i })).toBeNull();
        expect(screen.getByRole("button", { name: /Use Cloud API/i })).toBeTruthy();
    });

    it("waits for WebLLM generation teardown before allowing a model load", async () => {
        const originalStatus = useWebLLM.getState().status;
        useWebLLM.setState({ status: "generating" });
        const waiting = waitForWebLLMGenerationToSettle(100);

        useWebLLM.setState({ status: "ready" });
        await expect(waiting).resolves.toBe(true);
        useWebLLM.setState({ status: originalStatus });
    });

    it("bounds the wait when WebLLM generation does not unwind", async () => {
        vi.useFakeTimers();
        const originalStatus = useWebLLM.getState().status;
        useWebLLM.setState({ status: "generating" });
        const waiting = waitForWebLLMGenerationToSettle(50);

        await vi.advanceTimersByTimeAsync(50);
        await expect(waiting).resolves.toBe(false);
        useWebLLM.setState({ status: originalStatus });
    });

    it("identifies command-palette model choices as browser models", async () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            }
        );
        const previous = document.createElement("button");
        document.body.appendChild(previous);
        previous.focus();
        render(
            <CommandMenu
                onLoadModel={vi.fn()}
                browserModelsAvailable
                onNewChat={vi.fn()}
                ragEnabled={false}
                onToggleRAG={vi.fn()}
            />
        );

        fireEvent.keyDown(document, { key: "k", ctrlKey: true });
        expect(await screen.findByText("browser models")).toBeTruthy();
        await waitFor(() =>
            expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Search commands" }))
        );

        fireEvent.keyDown(document, { key: "Escape" });
        await waitFor(() => expect(document.activeElement).toBe(previous));
        previous.remove();
    });

    it("omits browser model commands when WebGPU is unavailable", async () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            }
        );
        render(
            <CommandMenu
                onLoadModel={vi.fn()}
                browserModelsAvailable={false}
                onNewChat={vi.fn()}
                ragEnabled={false}
                onToggleRAG={vi.fn()}
            />
        );

        fireEvent.keyDown(document, { key: "k", ctrlKey: true });
        await screen.findByRole("dialog", { name: "Command palette" });
        expect(screen.queryByText("browser models")).toBeNull();
    });

    it("does not open Cmd-K over another dialog or menu", () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            }
        );
        render(
            <>
                <div role="dialog" aria-label="Existing dialog" />
                <CommandMenu
                    onLoadModel={vi.fn()}
                    browserModelsAvailable
                    onNewChat={vi.fn()}
                    ragEnabled={false}
                    onToggleRAG={vi.fn()}
                />
            </>
        );

        expect(hasOpenOverlay()).toBe(true);
        expect(shouldToggleShortcuts(false)).toBe(false);
        expect(shouldToggleShortcuts(true)).toBe(true);
        fireEvent.keyDown(document, { key: "k", ctrlKey: true });
        expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    });

    it("contains Escape when closing the command palette", async () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            }
        );
        const lowerLayerEscape = vi.fn();
        render(
            <CommandMenu
                onLoadModel={vi.fn()}
                browserModelsAvailable
                onNewChat={vi.fn()}
                ragEnabled={false}
                onToggleRAG={vi.fn()}
            />
        );
        fireEvent.keyDown(document, { key: "k", ctrlKey: true });
        await screen.findByRole("dialog", { name: "Command palette" });
        document.addEventListener("keydown", lowerLayerEscape);

        fireEvent.keyDown(document, { key: "Escape" });

        expect(lowerLayerEscape).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
        document.removeEventListener("keydown", lowerLayerEscape);
    });
});
