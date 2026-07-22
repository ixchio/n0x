// @vitest-environment jsdom

import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/brand/pixel-nox-mark", () => ({
    PixelNoxMark: () => null,
}));

import { KeyboardShortcutsDialog } from "@/components/chat/workbench/keyboard-shortcuts-dialog";
import { PrivacyInspector } from "@/components/chat/workbench/workbench-panels";
import { Sidebar } from "@/components/layout/sidebar";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const dependencyProps = {
    ragCount: 0,
    cloudKeySet: false,
    deepSearchEnabled: false,
    memoryEnabled: false,
    provider: "browser" as const,
    webllm: { isSupported: true, gpuTier: "medium", error: null },
    chromeAI: { status: "unavailable", error: null },
    ollama: { isSupported: false, models: [], error: null },
    cloudAI: { apiKey: "", error: null },
};

describe("chat overlay dismissal", () => {
    it("closes the keyboard shortcuts dialog with Escape", () => {
        const onClose = vi.fn();
        const { unmount } = render(<KeyboardShortcutsDialog open onClose={onClose} />);

        fireEvent.keyDown(document, { key: "Escape" });

        expect(onClose).toHaveBeenCalledOnce();
        unmount();

        const outsideClose = vi.fn();
        render(<KeyboardShortcutsDialog open onClose={outsideClose} />);
        fireEvent.click(screen.getByRole("dialog").parentElement!);
        expect(outsideClose).toHaveBeenCalledOnce();
    });

    it("closes the privacy inspector with Escape and an outside pointer event", () => {
        const onClose = vi.fn();
        render(<PrivacyInspector open onClose={onClose} {...dependencyProps} />);

        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(document.body);
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("closes an open sidebar with Escape", () => {
        const onClose = vi.fn();
        render(<Sidebar isOpen currentModel={null} onClose={onClose} onNewChat={vi.fn()} conversations={[]} />);

        fireEvent.keyDown(document, { key: "Escape" });

        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.getByRole("complementary", { name: "Workspace navigation" })).toBeTruthy();
    });

    it("keeps a docked sidebar open and lets a higher overlay consume Escape", () => {
        const onClose = vi.fn();
        const matchMedia = vi.fn().mockReturnValue({ matches: true });
        vi.stubGlobal("matchMedia", matchMedia);
        const { rerender } = render(
            <Sidebar isOpen currentModel={null} onClose={onClose} onNewChat={vi.fn()} conversations={[]} />
        );

        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();

        matchMedia.mockReturnValue({ matches: false });
        rerender(
            <>
                <Sidebar
                    key="overlay-sidebar"
                    isOpen
                    currentModel={null}
                    onClose={onClose}
                    onNewChat={vi.fn()}
                    conversations={[]}
                />
                <div role="menu" aria-label="Higher menu" />
            </>
        );
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("contains focus in the tablet sidebar and restores the opener", async () => {
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));

        function Harness() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>Open navigation</button>
                    <Sidebar
                        isOpen={open}
                        currentModel={null}
                        onClose={() => setOpen(false)}
                        onNewChat={vi.fn()}
                        conversations={[]}
                    />
                    <main data-testid="workspace">Workspace</main>
                </>
            );
        }

        render(<Harness />);
        const opener = screen.getByRole("button", { name: "Open navigation" });
        opener.focus();
        fireEvent.click(opener);
        const aside = screen.getByRole("complementary", { name: "Workspace navigation" });
        const close = screen.getAllByRole("button", { name: "Close navigation sidebar" }).at(-1)!;
        await waitFor(() => expect(document.activeElement).toBe(close));
        expect(screen.getByTestId("workspace").getAttribute("aria-hidden")).toBe("true");

        const sidebarButtons = Array.from(aside.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
        const first = sidebarButtons[0];
        const last = sidebarButtons.at(-1)!;
        last.focus();
        fireEvent.keyDown(aside, { key: "Tab" });
        expect(document.activeElement).toBe(first);

        fireEvent.click(close);
        await waitFor(() => expect(document.activeElement).toBe(opener));
        expect(screen.getByTestId("workspace").getAttribute("aria-hidden")).toBeNull();
    });

    it("releases the workspace and focus trap when an open overlay becomes docked", async () => {
        let onViewportChange: (() => void) | undefined;
        const mediaQuery = {
            matches: false,
            addEventListener: vi.fn((_event: string, listener: () => void) => {
                onViewportChange = listener;
            }),
            removeEventListener: vi.fn(),
        };
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mediaQuery));

        render(
            <>
                <Sidebar isOpen currentModel={null} onClose={vi.fn()} onNewChat={vi.fn()} conversations={[]} />
                <main data-testid="resized-workspace">Workspace</main>
            </>
        );
        const workspace = screen.getByTestId("resized-workspace");
        await waitFor(() => expect(workspace.getAttribute("aria-hidden")).toBe("true"));

        mediaQuery.matches = true;
        act(() => onViewportChange?.());
        await waitFor(() => expect(workspace.getAttribute("aria-hidden")).toBeNull());

        const aside = screen.getByRole("complementary", { name: "Workspace navigation" });
        const buttons = Array.from(aside.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
        const last = buttons.at(-1)!;
        last.focus();
        fireEvent.keyDown(aside, { key: "Tab" });
        expect(document.activeElement).toBe(last);
    });

    it("does not steal focus after an outside click closes the privacy inspector", async () => {
        function Harness() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>Open inspector</button>
                    <input aria-label="Outside field" />
                    <PrivacyInspector open={open} onClose={() => setOpen(false)} {...dependencyProps} />
                </>
            );
        }

        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Open inspector" }));
        await waitFor(() =>
            expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close privacy inspector" }))
        );

        const outside = screen.getByRole("textbox", { name: "Outside field" });
        outside.focus();
        fireEvent.click(outside);

        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Privacy inspector" })).toBeNull());
        expect(document.activeElement).toBe(outside);
    });
});
