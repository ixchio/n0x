import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("offline build assets", () => {
    it("does not require Google Fonts during the production build", () => {
        const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
        const styles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

        expect(layout).not.toContain("next/font/google");
        expect(styles).toContain("--font-inter:");
        expect(styles).toContain("--font-mono:");
    });
});
