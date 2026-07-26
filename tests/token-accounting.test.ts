// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { addTokens, getLocalTokens, getTotalTokens } from "@/lib/providers/useWebLLM";

describe("provider token accounting", () => {
    beforeEach(() => localStorage.clear());

    it("keeps network-provider usage out of the local savings counter", () => {
        addTokens(20, false);
        expect(getTotalTokens()).toBe(20);
        expect(getLocalTokens()).toBe(0);

        addTokens(7, true);
        expect(getTotalTokens()).toBe(27);
        expect(getLocalTokens()).toBe(7);
    });
});
