export const PYODIDE_VERSION = "0.26.4";
export const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

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

export const PYODIDE_BRIDGE_LOCKDOWN_BOOTSTRAP = `
import sys as _n0x_sys
from pyodide import code as _n0x_pyodide_code

def _n0x_blocked_run_js(*args, **kwargs):
    raise PermissionError("JavaScript execution is disabled in the N0X Python worker")

_n0x_pyodide_code.run_js = _n0x_blocked_run_js
_n0x_sys.modules.pop("js", None)
_n0x_sys.modules.pop("pyodide_js", None)
`;

export interface PyodideExecutionResult {
    output: string;
    error: string | null;
    duration: number;
}

export type PyodideWorkerRequest = { id: number; type: "load" } | { id: number; type: "run"; code: string };

export type PyodideWorkerResponse =
    | { id: number; type: "progress"; progress: number }
    | { id: number; type: "loaded" }
    | { id: number; type: "result"; result: PyodideExecutionResult }
    | { id: number; type: "error"; error: string };
