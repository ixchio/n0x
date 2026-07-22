"use client";

import { useState, useCallback, useRef } from "react";
import { logger } from "@/lib/core/logger";

// Pyodide - In-browser Python (WebAssembly)
// Supports numpy, pandas, scipy, matplotlib, etc.

type Status = "unloaded" | "loading" | "ready" | "running" | "error";

interface Result {
    output: string;
    error: string | null;
    duration: number;
}

declare global {
    interface Window {
        loadPyodide: (opts?: { indexURL?: string }) => Promise<any>;
    }
}

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export const PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP = `
import sys
from io import StringIO

class _Out:
    def __init__(self):
        self.buf = StringIO()
    def write(self, s):
        self.buf.write(s)
    def flush(self):
        pass
    def get(self):
        return self.buf.getvalue()
    def clear(self):
        self.buf = StringIO()

_out = _Out()
sys.stdout = _out
sys.stderr = _out
`;

export function usePyodide() {
    const [status, setStatus] = useState<Status>("unloaded");
    const [loadProgress, setLoadProgress] = useState(0);
    const pyRef = useRef<any>(null);
    const loadingRef = useRef(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (pyRef.current || loadingRef.current) return;
        loadingRef.current = true;

        setStatus("loading");
        setLoadProgress(0.1);
        setLoadError(null);

        // Memory Guard
        const deviceMemory = (navigator as any).deviceMemory;
        if (deviceMemory && deviceMemory <= 4) {
            logger.warn(
                `[Hardware Warning] Device reports ${deviceMemory}GB RAM. Loading Pyodide may push this tab over its memory limit and crash.`
            );
        }

        try {
            // Load script
            if (!window.loadPyodide) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement("script");
                    script.src = `${PYODIDE_URL}pyodide.js`;
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error("Failed to load Pyodide"));
                    document.head.appendChild(script);
                });
            }

            setLoadProgress(0.3);

            // Initialize with indexURL for packages
            const py = await window.loadPyodide({ indexURL: PYODIDE_URL });

            setLoadProgress(0.7);

            // Setup output capture
            await py.runPythonAsync(PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP);

            pyRef.current = py;
            setLoadProgress(1);
            setStatus("ready");
        } catch (e: any) {
            logger.error("Pyodide error:", e);
            setStatus("error");
            setLoadProgress(0);
            setLoadError(e.message || "Failed to load Pyodide");
        } finally {
            loadingRef.current = false;
        }
    }, []);

    const run = useCallback(async (code: string): Promise<Result> => {
        if (!pyRef.current) {
            return { output: "", error: "Python not loaded", duration: 0 };
        }

        setStatus("running");
        const start = Date.now();

        try {
            const py = pyRef.current;

            // Clear output
            await py.runPythonAsync("_out.clear()");

            // Auto-load packages from imports
            try {
                await py.loadPackagesFromImports(code);
            } catch (pkgErr: any) {
                logger.warn("Package auto-load failed:", pkgErr.message);
                // Return early with a helpful error instead of continuing with broken imports
                return {
                    output: "",
                    error: `Failed to install required packages: ${pkgErr.message}.\n\nTip: Use 'import micropip; await micropip.install("package")' to install packages manually.`,
                    duration: Date.now() - start,
                };
            }

            // Execute
            const result = await py.runPythonAsync(code);

            // Get output
            const output = await py.runPythonAsync("_out.get()");

            const duration = Date.now() - start;
            // Combine output and return value
            let finalOutput = output || "";
            if (result !== undefined && result !== null) {
                const resultStr = String(result);
                if (!finalOutput.includes(resultStr)) {
                    finalOutput = finalOutput ? `${finalOutput}\n${resultStr}` : resultStr;
                }
            }

            return { output: finalOutput, error: null, duration };
        } catch (e: any) {
            return { output: "", error: e.message || String(e), duration: Date.now() - start };
        } finally {
            // Package-loading failures return early from the try block, so status
            // cleanup belongs in finally rather than only on the success path.
            setStatus("ready");
        }
    }, []);

    return {
        status,
        loadError,
        loadProgress,
        load,
        run,
        isReady: status === "ready",
        isLoading: status === "loading",
    };
}
