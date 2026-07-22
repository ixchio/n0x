// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP, usePyodide } from "@/lib/runtime/usePyodide";

describe("Pyodide bootstrap", () => {
    afterEach(() => {
        delete (window as Partial<Window>).loadPyodide;
    });

    it("installs valid Python output capture before running user code", async () => {
        const runPythonAsync = vi.fn(async (code: string) => {
            if (code === "_out.get()") return "hello\n";
            if (code === "40 + 2") return 42;
            return undefined;
        });
        const loadPackagesFromImports = vi.fn(async () => undefined);
        window.loadPyodide = vi.fn(async () => ({ runPythonAsync, loadPackagesFromImports }));

        const { result } = renderHook(() => usePyodide());

        await act(async () => {
            await result.current.load();
        });

        expect(result.current.status).toBe("ready");
        expect(runPythonAsync).toHaveBeenNthCalledWith(1, PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP);
        expect(PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP).toContain("from io import StringIO");
        expect(PYODIDE_OUTPUT_CAPTURE_BOOTSTRAP).not.toContain('from "@/');

        let execution: Awaited<ReturnType<typeof result.current.run>> | undefined;
        await act(async () => {
            execution = await result.current.run("40 + 2");
        });

        expect(loadPackagesFromImports).toHaveBeenCalledWith("40 + 2");
        expect(runPythonAsync).toHaveBeenCalledWith("_out.clear()");
        expect(execution).toMatchObject({ output: "hello\n\n42", error: null });
    });

    it("can retry after a failed bootstrap", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const runPythonAsync = vi
            .fn<(code: string) => Promise<unknown>>()
            .mockRejectedValueOnce(new Error("bootstrap failed"))
            .mockResolvedValue(undefined);
        window.loadPyodide = vi.fn(async () => ({
            runPythonAsync,
            loadPackagesFromImports: vi.fn(),
        }));

        const { result } = renderHook(() => usePyodide());
        await act(async () => result.current.load());

        expect(result.current.status).toBe("error");
        expect(result.current.loadError).toBe("bootstrap failed");

        await act(async () => result.current.load());
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(runPythonAsync).toHaveBeenCalledTimes(2);
    });
});
