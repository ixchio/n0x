"use client";

import { cn } from "@/lib/utils";

interface PixelNoxMarkProps {
    className?: string;
}

const CELLS = [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 1],
    [5, 2],
    [5, 3],
    [5, 4],
    [5, 5],
    [7, 1],
    [7, 5],
    [8, 2],
    [8, 4],
    [9, 3],
    [10, 2],
    [10, 4],
    [11, 1],
    [11, 5],
];

export function PixelNoxMark({ className }: PixelNoxMarkProps) {
    return (
        <svg
            viewBox="0 0 52 28"
            role="img"
            aria-label="N0X pixel mark"
            className={cn("h-5 w-9 shrink-0 text-emerald-300", className)}
        >
            <rect x="0.5" y="0.5" width="51" height="27" rx="5" fill="currentColor" fillOpacity="0.06" />
            <rect x="0.5" y="0.5" width="51" height="27" rx="5" stroke="currentColor" strokeOpacity="0.25" />
            {CELLS.map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x * 4} y={y * 4} width="3" height="3" rx="0.5" fill="currentColor" />
            ))}
            <rect x="27" y="8" width="2" height="12" fill="currentColor" fillOpacity="0.35" />
        </svg>
    );
}
import React from "react";
