import { blockApplicationGlobals, createRestrictedPythonGlobals } from "./pyodideIsolation";
import { installPyodideNetworkPolicy } from "./pyodideNetworkPolicy";
import {
    PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP,
    PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP,
    PYODIDE_URL,
    type PyodideExecutionResult,
    type PyodideWorkerRequest,
    type PyodideWorkerResponse,
} from "./pyodideProtocol";

interface PyodideRuntime {
    loadPackagesFromImports: (code: string) => Promise<void>;
    runPythonAsync: (code: string) => Promise<unknown>;
    unregisterJsModule: (name: string) => void;
}

interface PyodideWorkerScope {
    importScripts: (...urls: string[]) => void;
    loadPyodide?: (options: { indexURL: string; jsglobals: object }) => Promise<PyodideRuntime>;
    onmessage: ((event: MessageEvent<PyodideWorkerRequest>) => void) | null;
    postMessage: (response: PyodideWorkerResponse) => void;
}

const scope = globalThis as unknown as PyodideWorkerScope;
blockApplicationGlobals(globalThis);
installPyodideNetworkPolicy(globalThis);

let runtime: PyodideRuntime | null = null;
let runtimePromise: Promise<PyodideRuntime> | null = null;

function message(response: PyodideWorkerResponse): void {
    scope.postMessage(response);
}

async function loadRuntime(requestId: number): Promise<PyodideRuntime> {
    if (runtime) return runtime;
    if (runtimePromise) return runtimePromise;

    runtimePromise = (async () => {
        message({ id: requestId, type: "progress", progress: 0.3 });
        if (!scope.loadPyodide) {
            scope.importScripts(`${PYODIDE_URL}pyodide.js`);
        }
        if (!scope.loadPyodide) throw new Error("Pyodide loader did not initialize");

        message({ id: requestId, type: "progress", progress: 0.6 });
        const loaded = await scope.loadPyodide({
            indexURL: PYODIDE_URL,
            jsglobals: createRestrictedPythonGlobals(),
        });
        message({ id: requestId, type: "progress", progress: 0.85 });
        await loaded.runPythonAsync(PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP);
        // Pyodide registers `pyodide_js` as its full JavaScript API even when
        // `jsglobals` is restricted. Remove both bridges before user code can
        // run, then replace the convenience `run_js` entry point.
        loaded.unregisterJsModule("js");
        loaded.unregisterJsModule("pyodide_js");
        await loaded.runPythonAsync(PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP);
        runtime = loaded;
        return loaded;
    })();

    try {
        return await runtimePromise;
    } catch (error) {
        runtimePromise = null;
        throw error;
    }
}

async function execute(code: string, requestId: number): Promise<PyodideExecutionResult> {
    const pyodide = await loadRuntime(requestId);
    const startedAt = Date.now();

    await pyodide.runPythonAsync("_out.clear()");
    await pyodide.runPythonAsync(PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP);
    try {
        await pyodide.loadPackagesFromImports(code);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            output: "",
            error:
                `Failed to install required packages: ${detail}.\n\n` +
                "Only packages shipped from the pinned Pyodide asset host are available; arbitrary package downloads are blocked.",
            duration: Date.now() - startedAt,
        };
    }

    try {
        const value = await pyodide.runPythonAsync(code);
        const captured = await pyodide.runPythonAsync("_out.get()");
        let output = typeof captured === "string" ? captured : captured == null ? "" : String(captured);

        if (value !== undefined && value !== null) {
            const valueString = String(value);
            if (!output.includes(valueString)) output = output ? `${output}\n${valueString}` : valueString;
        }

        return { output, error: null, duration: Date.now() - startedAt };
    } catch (error) {
        return {
            output: "",
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startedAt,
        };
    }
}

async function handleRequest(request: PyodideWorkerRequest): Promise<void> {
    try {
        if (request.type === "load") {
            await loadRuntime(request.id);
            message({ id: request.id, type: "loaded" });
            return;
        }

        message({ id: request.id, type: "result", result: await execute(request.code, request.id) });
    } catch (error) {
        message({
            id: request.id,
            type: "error",
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

// The runtime and output capture are shared inside this worker. Keep requests
// strictly sequential even if a future caller bypasses the React-side mutex.
let requestQueue = Promise.resolve();
scope.onmessage = event => {
    requestQueue = requestQueue.then(() => handleRequest(event.data));
};
