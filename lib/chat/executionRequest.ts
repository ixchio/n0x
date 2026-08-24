import type { ExecutionMode, ExecutionSourceFlags } from "./executionPlan";

export interface ExecutionRequestOptionsInput {
    message: string;
    agentEnabled: boolean;
    deepSearchEnabled: boolean;
    hasDocuments: boolean;
    memoryEnabled: boolean;
    pythonEnabled?: boolean;
}

/** Documents are request inputs only while the user-visible Docs control is enabled. */
export function shouldUseDocumentContext(ragEnabled: boolean, documentCount: number): boolean {
    return ragEnabled && Number.isFinite(documentCount) && documentCount > 0;
}

/** Classifies request mode and freezes the source permissions captured by its plan. */
export function getExecutionRequestOptions(input: ExecutionRequestOptionsInput): {
    mode: ExecutionMode;
    sourceFlags: ExecutionSourceFlags;
} {
    const mode: ExecutionMode = input.agentEnabled ? "agent" : "direct";
    const sourceFlags: ExecutionSourceFlags = Object.freeze({
        search: input.deepSearchEnabled,
        documents: input.hasDocuments,
        memory: input.memoryEnabled,
        agent: mode === "agent",
        python: mode === "agent" && input.pythonEnabled === true,
    });
    return { mode, sourceFlags };
}
