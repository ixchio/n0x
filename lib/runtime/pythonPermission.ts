const APPROVAL_HEADING = "Agent Python permission";

export function canExposeAgentPython(pythonEnabled: boolean, pythonReady: boolean): boolean {
    return pythonEnabled && pythonReady;
}

/**
 * Consent is deliberately requested for every autonomous Python call. The
 * complete code is shown so approval is specific to what will execute; the
 * persistent Python toolbar toggle only controls tool availability.
 */
export function requestAgentPythonApproval(code: string): boolean {
    if (typeof window === "undefined") return false;
    return window.confirm(
        `${APPROVAL_HEADING}\n\n` +
            `The autonomous agent wants to run this code in an isolated Python worker:\n\n` +
            `${code || "(empty program)"}\n\n` +
            `Run this Python code?`
    );
}
