// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "@/components/chat/chat-input";

afterEach(cleanup);

function renderInput(onSend = vi.fn()) {
    render(
        <ChatInput
            input="draft"
            setInput={vi.fn()}
            onSend={onSend}
            isStreaming={false}
            deepSearchEnabled={false}
            toggleDeepSearch={vi.fn()}
            memoryEnabled={false}
            toggleMemory={vi.fn()}
        />
    );
    return onSend;
}

describe("chat composer keyboard behavior", () => {
    it("does not submit Enter while an IME composition is active", () => {
        const onSend = renderInput();
        const textarea = screen.getByRole("textbox", { name: "Message n0x" });

        fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });

        expect(onSend).not.toHaveBeenCalled();
    });

    it("submits an ordinary Enter", () => {
        const onSend = renderInput();

        fireEvent.keyDown(screen.getByRole("textbox", { name: "Message n0x" }), { key: "Enter" });

        expect(onSend).toHaveBeenCalledOnce();
    });

    it("does not expose a dead send action for an attached document without a question", () => {
        const onSend = vi.fn();
        render(
            <ChatInput
                input=""
                setInput={vi.fn()}
                onSend={onSend}
                isStreaming={false}
                deepSearchEnabled={false}
                toggleDeepSearch={vi.fn()}
                memoryEnabled={false}
                toggleMemory={vi.fn()}
                attachedFiles={[{ id: "doc-1", name: "policy.pdf", size: 100, type: "application/pdf" }]}
            />
        );

        expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole("textbox", { name: "Message n0x" }), { key: "Enter" });
        expect(onSend).not.toHaveBeenCalled();
    });
});
