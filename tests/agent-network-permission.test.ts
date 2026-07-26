// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_REVIEWABLE_AGENT_QUERY_CHARS, requestAgentSearchApproval } from "@/lib/runtime/networkPermission";

describe("agent network information-flow gate", () => {
    afterEach(() => vi.restoreAllMocks());

    it("shows the exact outbound query and respects denial", () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        const query = "retention policy after account closure";

        expect(requestAgentSearchApproval(query)).toBe(false);
        expect(confirm).toHaveBeenCalledOnce();
        expect(confirm.mock.calls[0][0]).toContain("Agent network permission");
        expect(confirm.mock.calls[0][0]).toContain(query);
    });

    it("blocks empty or unreviewably large queries without network approval", () => {
        const confirm = vi.spyOn(window, "confirm");
        expect(requestAgentSearchApproval("  ")).toBe(false);
        expect(requestAgentSearchApproval("x".repeat(MAX_REVIEWABLE_AGENT_QUERY_CHARS + 1))).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
    });
});
