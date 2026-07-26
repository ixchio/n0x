"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface StorageDurabilityAlertProps {
    chatError: string | null;
    memoryError: string | null;
}

export function StorageDurabilityAlert({ chatError, memoryError }: StorageDurabilityAlertProps) {
    if (!chatError && !memoryError) return null;

    return (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 sm:px-6">
            <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="mx-auto flex max-w-5xl items-start gap-2 text-xs leading-5 text-amber-200"
            >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <div>
                    <p className="font-semibold">Browser storage needs attention.</p>
                    {chatError && (
                        <p>
                            Conversation changes may not survive a reload. Check available browser storage and site
                            permissions.
                        </p>
                    )}
                    {memoryError && (
                        <p>
                            Memory changes were not saved. Check available browser storage and site permissions, then
                            try again.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
