// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShareMenu } from "@/components/chat/share-menu";

describe("share popover accessibility", () => {
    it("moves focus into the dialog, traps it, and restores the trigger on Escape", async () => {
        render(<ShareMenu label="Share" messages={[]} />);
        const trigger = screen.getByRole("button", { name: "Share or export conversation" });
        fireEvent.click(trigger);

        const dialog = screen.getByRole("dialog", { name: "Share and export conversation" });
        const close = screen.getByRole("button", { name: "Close share menu" });
        await waitFor(() => expect(document.activeElement).toBe(close));

        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
        close.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(focusable.at(-1));

        fireEvent.keyDown(document, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(document.activeElement).toBe(trigger);
    });
});
