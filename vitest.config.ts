import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname),
        },
    },
    test: {
        clearMocks: true,
        restoreMocks: true,
        setupFiles: ["./tests/setup.ts"],
    },
});
