"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded bg-zinc-800/50",
                className
            )}
        />
    );
}

export function MessageSkeleton() {
    return (
        <div className="flex gap-4 p-4 animate-in fade-in duration-300">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
            </div>
        </div>
    );
}

export function SearchSkeleton() {
    return (
        <div className="space-y-4 p-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-phosphor animate-pulse" />
                <Skeleton className="h-4 w-32" />
            </div>
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-4/5" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CodeBlockSkeleton() {
    return (
        <div className="rounded-lg border border-zinc-800 overflow-hidden animate-in fade-in duration-300">
            <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
            </div>
            <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
            </div>
        </div>
    );
}

export function DocumentSkeleton() {
    return (
        <div className="space-y-4 p-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                </div>
            </div>
            <div className="space-y-2">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-3/4" />
            </div>
        </div>
    );
}

export function SidebarSkeleton() {
    return (
        <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                </div>
            ))}
        </div>
    );
}
