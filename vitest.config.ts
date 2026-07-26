import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname),
            // voy-search 0.6.3 publishes a browser module without a Vite-resolvable
            // package entry. Webpack resolves it in the app; point tests at that
            // same published module so the RAG worker can be exercised.
            "voy-search": path.resolve(__dirname, "node_modules/voy-search/voy_search.js"),
        },
    },
    test: {
        clearMocks: true,
        restoreMocks: true,
        setupFiles: ["./tests/setup.ts"],
    },
});
