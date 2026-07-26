"use client";

import React, { memo, useCallback, useMemo } from "react";
import { LazyMessageBubble } from "@/components/chat/lazy-message-bubble";
import type { ChatMessage, ChatMessageMeta } from "@/lib/chat/useChatStore";

type RunCode = (code: string) => Promise<{ output: string; error: string | null; duration: number }>;

interface PersistedMessageListProps {
    messages: ChatMessage[];
    onRunCode?: RunCode;
    onBranch: (messageId: string) => void;
}

interface PersistedMessageRowProps {
    message: ChatMessage;
    previousPrompt?: string;
    onRunCode?: RunCode;
    onBranch: (messageId: string) => void;
}

export interface MessageProvenance {
    message: ChatMessage;
    previousPrompt?: string;
}

const SAVED_MESSAGE_META: ChatMessageMeta = {
    provider: "browser",
    providerLabel: "Saved message",
    modelName: "provider not recorded",
    privacy: "unknown",
};

/** Attach the nearest preceding user prompt to each assistant message in one pass. */
export function buildMessageProvenance(messages: ChatMessage[]): MessageProvenance[] {
    let previousUserPrompt: string | undefined;

    return messages.map(message => {
        const previousPrompt = message.role === "assistant" ? previousUserPrompt : undefined;
        if (message.role === "user") previousUserPrompt = message.content;
        return { message, previousPrompt };
    });
}

const PersistedMessageRow = memo(function PersistedMessageRow({
    message,
    previousPrompt,
    onRunCode,
    onBranch,
}: PersistedMessageRowProps) {
    const handleBranch = useCallback(() => onBranch(message.id), [message.id, onBranch]);

    return (
        <LazyMessageBubble
            role={message.role}
            content={message.content}
            image={message.image}
            meta={message.meta || SAVED_MESSAGE_META}
            timestamp={message.timestamp}
            previousPrompt={previousPrompt}
            onRunCode={onRunCode}
            onBranch={handleBranch}
        />
    );
});

export const PersistedMessageList = memo(function PersistedMessageList({
    messages,
    onRunCode,
    onBranch,
}: PersistedMessageListProps) {
    const messageProvenance = useMemo(() => buildMessageProvenance(messages), [messages]);

    return messageProvenance.map(({ message, previousPrompt }) => (
        <PersistedMessageRow
            key={message.id}
            message={message}
            previousPrompt={previousPrompt}
            onRunCode={onRunCode}
            onBranch={onBranch}
        />
    ));
});
