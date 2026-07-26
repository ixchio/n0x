const APPROVAL_HEADING = "Agent network permission";
export const MAX_REVIEWABLE_AGENT_QUERY_CHARS = 800;

/**
 * A prompt rule cannot enforce information-flow security. Conversation
 * history can also contain private evidence from an earlier request, so every
 * autonomous search shows its exact model-authored query before egress.
 */
export function requestAgentSearchApproval(query: string): boolean {
    if (typeof window === "undefined") return false;
    const normalized = query.trim();
    if (!normalized || normalized.length > MAX_REVIEWABLE_AGENT_QUERY_CHARS) return false;
    return window.confirm(
        `${APPROVAL_HEADING}\n\n` +
            "This agent can also read enabled local documents or memory. It wants to send this exact query to N0X search providers:\n\n" +
            `${normalized}\n\n` +
            "Send this search query over the network?"
    );
}
