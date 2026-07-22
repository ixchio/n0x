import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' data: blob: https: http: ws: wss:",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "child-src 'self' blob:",
    "frame-src 'self' data: blob:",
    "media-src 'self' data: blob: https:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    output: "standalone", // Required for Docker
    outputFileTracingRoot: __dirname,
    experimental: {
        // Enable server actions for potential future use
    },
    webpack: (config, { isServer }) => {
        // Enable WebAssembly support (required by voy-search)
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
        };
        config.output.environment = {
            ...config.output.environment,
            asyncFunction: true,
        };

        // onnxruntime-web ships ort.webgpu.bundle.min.mjs which uses `import.meta` and
        // binary-like WASM inlining that SWC/webpack cannot parse. Exclude from all processing.
        config.module.rules.push({
            test: /ort\.webgpu\.bundle\.min\.mjs$/,
            resolve: { fullySpecified: false },
            type: "javascript/esm",
            use: [],
        });

        // @huggingface/transformers depends on onnxruntime-node which contains native .node binaries.
        // On the client: alias to false (not needed — uses onnxruntime-web in browser).
        // On the server: mark as external so webpack doesn't try to parse .node binaries.
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                "onnxruntime-node": false,
            };
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
                os: false,
            };
        } else {
            config.externals = config.externals || [];
            config.externals.push("onnxruntime-node");
            // @huggingface/transformers references ONNX runtime WASM modules that only work
            // in the browser. On server, externalize the entire transformers node entry point.
            config.externals.push("@huggingface/transformers");
        }
        return config;
    },
    // COEP "credentialless" allows cross-origin resources (Ollama, Cloud APIs,
    // Pollinations images, Pyodide CDN) WITHOUT requiring CORP headers on every
    // response. "require-corp" was blocking all of those — this is the fix.
    // SharedArrayBuffer (needed by WebContainers) still works with credentialless.
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
                    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Content-Security-Policy", value: contentSecurityPolicy },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), geolocation=(), payment=(), usb=(), serial=()",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
