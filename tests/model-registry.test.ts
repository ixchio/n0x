import { describe, expect, it } from "vitest";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { MODEL_CATEGORIES, WEBLLM_MODELS } from "@/lib/providers/useWebLLM";

describe("WebLLM model registry", () => {
    it("only advertises model IDs shipped by the installed WebLLM runtime", () => {
        const runtimeIds = new Set(prebuiltAppConfig.model_list.map(model => model.model_id));
        const unavailable = WEBLLM_MODELS.map(model => model.id).filter(id => !runtimeIds.has(id));

        expect(unavailable).toEqual([]);
    });

    it("has unique, complete entries with known categories", () => {
        expect(new Set(WEBLLM_MODELS.map(model => model.id)).size).toBe(WEBLLM_MODELS.length);

        for (const model of WEBLLM_MODELS) {
            expect(model.id).toMatch(/-MLC$/);
            expect(model.label).not.toHaveLength(0);
            expect(model.desc).not.toHaveLength(0);
            expect(model.size).toMatch(/MB|GB/);
            expect(MODEL_CATEGORIES).toHaveProperty(model.category);
        }
    });
});
