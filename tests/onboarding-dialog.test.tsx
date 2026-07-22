// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Onboarding } from "@/components/system/onboarding";

describe("Onboarding dialog", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("traps focus, closes with Escape, and restores the previous focus", async () => {
        const previous = document.createElement("button");
        previous.textContent = "Previous control";
        document.body.appendChild(previous);
        previous.focus();
        const onComplete = vi.fn();

        const { unmount } = render(<Onboarding onComplete={onComplete} />);
        const dialog = await screen.findByRole("dialog", { name: "Welcome to n0x" });
        expect(dialog.getAttribute("aria-modal")).toBe("true");

        const close = screen.getByRole("button", { name: "Close welcome dialog" });
        const start = screen.getByRole("button", { name: /Get Started/i });
        await waitFor(() => expect(document.activeElement).toBe(close));

        start.focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(close);

        fireEvent.keyDown(document, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(onComplete).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(previous);

        unmount();
        previous.remove();
    });
});
