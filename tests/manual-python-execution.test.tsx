// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { codeResultKey, MessageBubble } from "@/components/chat/message-bubble";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

describe("manual Python execution", () => {
    it("runs a displayed Python block only after the user clicks Run", async () => {
        const run = vi.fn(async () => ({ output: "42", error: null, duration: 1 }));
        render(<MessageBubble role="assistant" content={"```python\nprint(6 * 7)\n```"} onRunCode={run} />);

        expect(run).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Run Python code" }));

        await waitFor(() => expect(run).toHaveBeenCalledExactlyOnceWith("print(6 * 7)"));
        expect(await screen.findByText("42")).toBeTruthy();
    });

    it("keeps results separate when code blocks share the same first 50 characters", () => {
        const sharedPrefix = "x".repeat(55);
        const firstCode = `${sharedPrefix}-first`;
        const secondCode = `${sharedPrefix}-second`;

        expect(codeResultKey(firstCode)).not.toBe(codeResultKey(secondCode));
    });
});
