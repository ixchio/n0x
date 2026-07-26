/**
 * Browser state must never be registered as Pyodide's `js` module. A null-
 * prototype object also prevents reaching host constructors through inherited
 * properties such as `constructor` or `__proto__`.
 */
export function createRestrictedPythonGlobals(): Record<string, never> {
    return Object.create(null) as Record<string, never>;
}

export const BLOCKED_PYTHON_GLOBALS = [
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "cookieStore",
] as const;

function defineLocked(scope: object, name: string, value: unknown): void {
    Object.defineProperty(scope, name, {
        configurable: false,
        enumerable: false,
        value,
        writable: false,
    });
}

/**
 * Shadow a worker capability and replace configurable copies on its prototype
 * chain. Replacing the prototype descriptor prevents host-JS evaluation from
 * recovering the original getter with Object.getOwnPropertyDescriptor().
 */
export function lockWorkerCapability(scope: object, name: string, value: unknown): void {
    defineLocked(scope, name, value);

    let prototype = Object.getPrototypeOf(scope) as object | null;
    while (prototype) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (descriptor) {
            if (!descriptor.configurable) {
                throw new Error(`Cannot isolate Python worker capability: ${name}`);
            }
            defineLocked(prototype, name, value);
        }
        prototype = Object.getPrototypeOf(prototype) as object | null;
    }
}

/**
 * Dedicated workers do not expose window or Web Storage, but they normally do
 * expose the page origin's IndexedDB. Shadow all application storage globals
 * before Pyodide loads so even JS evaluated inside the worker cannot use them.
 */
export function blockApplicationGlobals(scope: object): void {
    for (const name of BLOCKED_PYTHON_GLOBALS) {
        lockWorkerCapability(scope, name, undefined);
    }
}
