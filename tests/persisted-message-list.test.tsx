// @vitest-environment jsdom

import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/chat/useChatStore";

const bubbleRenderCounts = vi.hoisted(() => new Map<string, number>());

vi.mock("@/components/chat/lazy-message-bubble", () => ({
    LazyMessageBubble: ({
        content,
        previousPrompt,
        onBranch,
    }: {
        content: string;
        previousPrompt?: string;
        onBranch?: () => void;
    }) => {
        bubbleRenderCounts.set(content, (bubbleRenderCounts.get(content) || 0) + 1);
        return (
            <button data-testid={`message-${content}`} data-previous-prompt={previousPrompt} onClick={onBranch}>
                {content}
            </button>
        );
    },
}));

import { buildMessageProvenance, PersistedMessageList } from "@/components/chat/persisted-message-list";

function message(index: number, role: ChatMessage["role"]): ChatMessage {
    return {
        id: `message-${index}`,
        role,
        content: `${role}-${index}`,
        timestamp: index,
    };
}

beforeEach(() => bubbleRenderCounts.clear());

describe("persisted message rendering", () => {
    it("attaches the nearest preceding user prompt to assistants in one pass", () => {
        const messages = [
            message(0, "assistant"),
            message(1, "user"),
            message(2, "assistant"),
            message(3, "assistant"),
            message(4, "user"),
            message(5, "assistant"),
        ];

        expect(buildMessageProvenance(messages).map(item => item.previousPrompt)).toEqual([
            undefined,
            undefined,
            "user-1",
            "user-1",
            undefined,
            "user-4",
        ]);
    });

    it("does not rerender a long persisted transcript for unrelated parent updates", () => {
        const initialMessages = Array.from({ length: 120 }, (_, index) =>
            message(index, index % 2 === 0 ? "user" : "assistant")
        );
        const appendedMessage = message(120, "assistant");
        const onBranch = vi.fn();
        const onRunCode = vi.fn(async () => ({ output: "", error: null, duration: 0 }));

        function Harness() {
            const [tick, setTick] = useState(0);
            const [messages, setMessages] = useState(initialMessages);
            return (
                <>
                    <button onClick={() => setTick(value => value + 1)}>Parent update {tick}</button>
                    <button onClick={() => setMessages(current => [...current, appendedMessage])}>Append</button>
                    <PersistedMessageList messages={messages} onRunCode={onRunCode} onBranch={onBranch} />
                </>
            );
        }

        render(<Harness />);
        const initialRenderTotal = [...bubbleRenderCounts.values()].reduce((sum, count) => sum + count, 0);
        expect(initialRenderTotal).toBe(120);

        fireEvent.click(screen.getByRole("button", { name: "Parent update 0" }));
        expect([...bubbleRenderCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(initialRenderTotal);

        const assistant = screen.getByTestId("message-assistant-119");
        expect(assistant.getAttribute("data-previous-prompt")).toBe("user-118");
        fireEvent.click(assistant);
        expect(onBranch).toHaveBeenCalledExactlyOnceWith("message-119");

        fireEvent.click(screen.getByRole("button", { name: "Append" }));
        expect([...bubbleRenderCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(initialRenderTotal + 1);
        expect(screen.getByTestId("message-assistant-120").getAttribute("data-previous-prompt")).toBe("user-118");
    });
});
