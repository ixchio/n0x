import { isImageRequest } from "./imageGeneration";
import type { ExecutionMode, ExecutionSourceFlags } from "./executionPlan";

export interface ExecutionRequestOptionsInput {
    message: string;
    agentEnabled: boolean;
    deepSearchEnabled: boolean;
    hasDocuments: boolean;
    memoryEnabled: boolean;
}

/** Classifies request mode and freezes the source permissions captured by its plan. */
export function getExecutionRequestOptions(input: ExecutionRequestOptionsInput): {
    mode: ExecutionMode;
    sourceFlags: ExecutionSourceFlags;
} {
    const image = isImageRequest(input.message);
    const mode: ExecutionMode = image ? "image" : input.agentEnabled ? "agent" : "direct";
    const sourceFlags: ExecutionSourceFlags = Object.freeze({
        search: image ? false : input.deepSearchEnabled,
        documents: image ? false : input.hasDocuments,
        memory: image ? false : input.memoryEnabled,
        agent: mode === "agent",
    });
    return { mode, sourceFlags };
}
