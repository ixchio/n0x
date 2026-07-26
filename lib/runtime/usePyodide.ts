"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/core/logger";
import { type PyodideExecutionResult, type PyodideWorkerRequest, type PyodideWorkerResponse } from "./pyodideProtocol";

export { PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP } from "./pyodideProtocol";

type Status = "unloaded" | "loading" | "ready" | "running" | "error";

interface RunOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

interface PendingRequest {
    reject: (error: Error) => void;
    resolve: (response: PyodideWorkerResponse) => void;
    timeout: ReturnType<typeof setTimeout>;
}

type PyodideWorkerRequestPayload = { type: "load" } | { type: "run"; code: string };

const LOAD_TIMEOUT_MS = 180_000;
const RUN_TIMEOUT_MS = 120_000;

function stoppedError(reason: string): Error {
    const error = new Error(reason);
    error.name = "PythonWorkerTerminatedError";
    return error;
}

export function usePyodide() {
    const [status, setStatus] = useState<Status>("unloaded");
    const [loadProgress, setLoadProgress] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingRef = useRef(new Map<number, PendingRequest>());
    const nextRequestIdRef = useRef(0);
    const readyRef = useRef(false);
    const loadingPromiseRef = useRef<Promise<void> | null>(null);
    const runningRef = useRef(false);
    const mountedRef = useRef(true);

    const disposeWorker = useCallback((error: Error, nextStatus: Status = "unloaded") => {
        const worker = workerRef.current;
        workerRef.current = null;
        readyRef.current = false;
        runningRef.current = false;
        loadingPromiseRef.current = null;
        worker?.terminate();

        for (const [id, pending] of pendingRef.current) {
            clearTimeout(pending.timeout);
            pending.reject(error);
            pendingRef.current.delete(id);
        }

        if (mountedRef.current) {
            setStatus(nextStatus);
            if (nextStatus !== "error") setLoadError(null);
            setLoadProgress(0);
        }
    }, []);

    const ensureWorker = useCallback((): Worker => {
        if (workerRef.current) return workerRef.current;
        if (typeof Worker === "undefined") throw new Error("Web Workers are required for isolated Python execution");

        const worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url));
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<PyodideWorkerResponse>) => {
            const response = event.data;
            if (response.type === "progress") {
                if (mountedRef.current) setLoadProgress(response.progress);
                return;
            }

            const pending = pendingRef.current.get(response.id);
            if (!pending) return;
            clearTimeout(pending.timeout);
            pendingRef.current.delete(response.id);
            if (response.type === "error") pending.reject(new Error(response.error));
            else pending.resolve(response);
        };

        worker.onerror = event => {
            const error = new Error(event.message || "Python worker crashed");
            logger.error("Pyodide worker error:", error);
            if (mountedRef.current) setLoadError(error.message);
            disposeWorker(error, "error");
        };

        worker.onmessageerror = () => {
            const error = new Error("Python worker returned an unreadable response");
            if (mountedRef.current) setLoadError(error.message);
            disposeWorker(error, "error");
        };

        return worker;
    }, [disposeWorker]);

    const sendRequest = useCallback(
        (request: PyodideWorkerRequestPayload, timeoutMs: number): Promise<PyodideWorkerResponse> => {
            const worker = ensureWorker();
            const id = ++nextRequestIdRef.current;

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    const operation = request.type === "load" ? "loading" : "execution";
                    const error = new Error(`Python ${operation} timed out and its isolated worker was terminated`);
                    if (mountedRef.current) setLoadError(error.message);
                    disposeWorker(error, "error");
                }, timeoutMs);
                pendingRef.current.set(id, { reject, resolve, timeout });
                const workerRequest: PyodideWorkerRequest =
                    request.type === "load" ? { id, type: "load" } : { id, type: "run", code: request.code };
                worker.postMessage(workerRequest);
            });
        },
        [disposeWorker, ensureWorker]
    );

    const load = useCallback(async (): Promise<void> => {
        if (readyRef.current) return;
        if (loadingPromiseRef.current) return loadingPromiseRef.current;

        const loading = (async () => {
            setStatus("loading");
            setLoadProgress(0.1);
            setLoadError(null);

            const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
            if (deviceMemory && deviceMemory <= 4) {
                logger.warn(
                    `[Hardware Warning] Device reports ${deviceMemory}GB RAM. Loading Pyodide may push this tab over its memory limit and crash.`
                );
            }

            try {
                const response = await sendRequest({ type: "load" }, LOAD_TIMEOUT_MS);
                if (response.type !== "loaded") throw new Error("Python worker did not finish loading");
                readyRef.current = true;
                if (mountedRef.current) {
                    setLoadProgress(1);
                    setStatus("ready");
                }
            } catch (error) {
                if ((error as Error).name === "PythonWorkerTerminatedError") return;
                const detail = error instanceof Error ? error.message : String(error);
                logger.error("Pyodide error:", error);
                if (mountedRef.current) setLoadError(detail);
                disposeWorker(error instanceof Error ? error : new Error(detail), "error");
            } finally {
                loadingPromiseRef.current = null;
            }
        })();

        loadingPromiseRef.current = loading;
        return loading;
    }, [disposeWorker, sendRequest]);

    const terminate = useCallback(
        (reason = "Python execution stopped") => {
            disposeWorker(stoppedError(reason));
        },
        [disposeWorker]
    );

    const run = useCallback(
        async (code: string, options: RunOptions = {}): Promise<PyodideExecutionResult> => {
            if (!readyRef.current) return { output: "", error: "Python not loaded", duration: 0 };
            if (options.signal?.aborted) return { output: "", error: "Python execution cancelled", duration: 0 };
            if (runningRef.current) {
                return {
                    output: "",
                    error: "Another Python execution is already running. Stop it or wait for it to finish.",
                    duration: 0,
                };
            }

            const startedAt = Date.now();
            runningRef.current = true;
            const abort = () => terminate("Python execution cancelled");
            options.signal?.addEventListener("abort", abort, { once: true });
            setStatus("running");

            try {
                const response = await sendRequest({ type: "run", code }, options.timeoutMs ?? RUN_TIMEOUT_MS);
                if (response.type !== "result") throw new Error("Python worker returned an invalid execution result");
                return response.result;
            } catch (error) {
                return {
                    output: "",
                    error: error instanceof Error ? error.message : String(error),
                    duration: Date.now() - startedAt,
                };
            } finally {
                runningRef.current = false;
                options.signal?.removeEventListener("abort", abort);
                if (mountedRef.current && readyRef.current) setStatus("ready");
            }
        },
        [sendRequest, terminate]
    );

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            disposeWorker(stoppedError("Python runtime disposed"));
        };
    }, [disposeWorker]);

    return {
        status,
        loadError,
        loadProgress,
        load,
        run,
        terminate,
        isReady: status === "ready",
        isLoading: status === "loading",
        isRunning: status === "running",
    };
}
