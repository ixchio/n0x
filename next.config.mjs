/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // Required for Docker
  experimental: {
    // Enable server actions for potential future use
  },
  webpack: (config, { isServer }) => {
    // Enable WebAssembly support (required by voy-search)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    // @xenova/transformers depends on onnxruntime-node which contains native .node binaries.
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
    }
    return config;
  },
  // Allow connecting to Ollama from client-side
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
