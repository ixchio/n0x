// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkbenchPreferences } from "@/components/chat/workbench/use-workbench-preferences";

function mockViewport(desktop: boolean) {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: desktop,
            media: query,
            onchange: null,
            addEventListener,
            removeEventListener,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
    return { addEventListener, removeEventListener };
}

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("chat workbench preference hydration", () => {
    it.each([
        ["mobile", false, false],
        ["desktop", true, true],
    ] as const)("starts deterministically and applies stored preferences on %s", (_, desktop, expectedSidebarOpen) => {
        localStorage.setItem("n0x-provider", "cloud");
        localStorage.setItem("n0x-ollama-url", "http://ollama.test:11434");
        const media = mockViewport(desktop);
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const renders: Array<{ provider: string; sidebarOpen: boolean }> = [];

        const { result, unmount } = renderHook(() => {
            const preferences = useWorkbenchPreferences();
            renders.push({ provider: preferences.provider, sidebarOpen: preferences.sidebarOpen });
            return preferences;
        });

        expect(renders[0]).toEqual({ provider: "browser", sidebarOpen: false });
        expect(result.current.provider).toBe("cloud");
        expect(result.current.ollamaUrl).toBe("http://ollama.test:11434");
        expect(result.current.sidebarOpen).toBe(expectedSidebarOpen);
        expect(media.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
        expect(consoleError.mock.calls.flat().join(" ").toLowerCase()).not.toContain("hydration");

        unmount();
        expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });
});
