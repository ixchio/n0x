import { describe, expect, it } from "vitest";
import { classifyComplexity, routeMessage } from "@/lib/chat/useAutoRouter";
import { isNetworkedEndpoint, resolveExecutionPrivacy } from "@/lib/chat/executionPlan";

describe("routing and privacy helpers", () => {
    it("keeps simple prompts local and routes complex work to configured cloud", () => {
        expect(classifyComplexity("What is RAG?")).toBe("simple");
        expect(
            classifyComplexity(
                "Design and implement a detailed API migration, compare the trade-offs, and include comprehensive tests."
            )
        ).toBe("complex");

        expect(
            routeMessage({
                message: "What is RAG?",
                hasDocuments: false,
                deepSearchEnabled: false,
                conversationLength: 2,
                localModelLoaded: true,
                cloudConfigured: true,
            })
        ).toMatchObject({ decision: "local" });

        expect(
            routeMessage({
                message: "Design and implement a detailed API migration with comprehensive tests.",
                hasDocuments: true,
                deepSearchEnabled: true,
                conversationLength: 2,
                localModelLoaded: true,
                cloudConfigured: true,
            })
        ).toMatchObject({ decision: "cloud" });
    });

    it("never labels explicit network paths as local", () => {
        const noSources = { search: false };

        expect(resolveExecutionPrivacy("browser", noSources)).toBe("local");
        expect(resolveExecutionPrivacy("browser", { search: true })).toBe("mixed");
        expect(resolveExecutionPrivacy("ollama", noSources, true)).toBe("mixed");
        expect(resolveExecutionPrivacy("cloud", noSources)).toBe("cloud");
        expect(resolveExecutionPrivacy("image", noSources)).toBe("cloud");

        expect(isNetworkedEndpoint("http://127.0.0.1:11434")).toBe(false);
        expect(isNetworkedEndpoint("http://localhost:11434")).toBe(false);
        expect(isNetworkedEndpoint("https://api.example.com/v1")).toBe(true);
        expect(isNetworkedEndpoint("not a url")).toBe(true);
    });
});
