"use client";

import { useState, useCallback, useRef } from "react";

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

const PYODIDE_VERSION = "0.25.0";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export function usePyodide() {
    const [status, setStatus] = useState<Status>("unloaded");
    const [loadProgress, setLoadProgress] = useState(0);
    const pyRef = useRef<any>(null);
    const loadingRef = useRef(false);

    const load = useCallback(async () => {
        if (pyRef.current || loadingRef.current) return;
        loadingRef.current = true;

        setStatus("loading");
        setLoadProgress(0.1);

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
            await py.runPythonAsync(`
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
`);

            pyRef.current = py;
            setLoadProgress(1);
            setStatus("ready");
        } catch (e) {
            console.error("Pyodide error:", e);
            setStatus("error");
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
            await py.loadPackagesFromImports(code);

            // Execute
            const result = await py.runPythonAsync(code);

            // Get output
            const output = await py.runPythonAsync("_out.get()");

            const duration = Date.now() - start;
            setStatus("ready");

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
            setStatus("ready");
            return { output: "", error: e.message || String(e), duration: Date.now() - start };
        }
    }, []);

    return {
        status,
        loadProgress,
        load,
        run,
        isReady: status === "ready",
        isLoading: status === "loading",
    };
}
