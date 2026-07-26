"use client";

import React from "react";
import dynamic from "next/dynamic";

export const LazyMessageBubble = dynamic(
    () => import("@/components/chat/message-bubble").then(module => module.MessageBubble),
    {
        ssr: false,
        loading: () => (
            <div
                aria-label="Loading message"
                role="status"
                className="h-16 animate-pulse rounded-xl border border-zinc-800/70 bg-zinc-900/30 motion-reduce:animate-none"
            />
        ),
    }
);
