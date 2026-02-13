"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null; info: string }

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, info: "" };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, info: "" };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("ErrorBoundary:", error, info);
        this.setState({ info: info.componentStack || "" });
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        const msg = this.state.error?.message?.toLowerCase() || "";
        const gpuCrash = msg.includes("webgpu") || msg.includes("gpu") || msg.includes("wasm");

        return (
            <div className="h-screen flex items-center justify-center bg-crt-black p-6">
                <div className="max-w-md w-full bg-crt-surface border border-crt-border rounded p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <h2 className="text-sm font-mono text-red-400">
                            {gpuCrash ? "GPU Error" : "Runtime Error"}
                        </h2>
                    </div>

                    <p className="text-xs font-mono text-txt-secondary leading-relaxed">
                        {gpuCrash
                            ? <>WebGPU crashed — probably out of VRAM. Try a <span className="text-phosphor">smaller model</span> or close other tabs.</>
                            : <>Something broke. This shouldn&apos;t happen.</>
                        }
                    </p>

                    {this.state.error && (
                        <pre className="text-[10px] font-mono text-txt-tertiary bg-crt-black p-3 rounded overflow-auto max-h-32 border border-crt-border">
                            {this.state.error.message}
                        </pre>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={() => this.setState({ hasError: false, error: null, info: "" })}
                            className="flex-1 px-3 py-2 text-xs font-mono border border-phosphor-dim text-phosphor rounded hover:bg-phosphor-faint transition-all"
                        >
                            try again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 px-3 py-2 text-xs font-mono border border-crt-border text-txt-secondary rounded hover:text-txt-primary transition-all"
                        >
                            reload
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
