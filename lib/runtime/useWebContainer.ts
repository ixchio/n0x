"use client";

import { create } from "zustand";
import { WebContainer } from "@webcontainer/api";
import { logger } from "@/lib/core/logger";

type WebContainerStatus = "unloaded" | "loading" | "ready" | "error";

interface WebContainerState {
    status: WebContainerStatus;
    instance: WebContainer | null;
    error: string | null;
    previewUrl: string | null;

    init: () => Promise<void>;
    writeFile: (path: string, contents: string) => Promise<void>;
    runCommand: (command: string, args: string[]) => Promise<string>;
    startDevServer: () => Promise<void>;
}

export const useWebContainer = create<WebContainerState>((set, get) => ({
    status: "unloaded",
    instance: null,
    error: null,
    previewUrl: null,

    init: async () => {
        if (get().status !== "unloaded") return;
        set({ status: "loading" });

        try {
            // Check if we're in a cross-origin isolated environment
            if (typeof window !== "undefined" && !window.crossOriginIsolated) {
                logger.warn("WebContainers require Cross-Origin Isolation (COOP/COEP headers).");
                set({ error: "Missing COOP/COEP headers for WebContainers", status: "error" });
                return;
            }

            const instance = await WebContainer.boot();

            instance.on("server-ready", (port, url) => {
                logger.info(`WebContainer Server ready at ${url}`);
                set({ previewUrl: url });
            });

            // Mount a basic package.json for React/Vite to speed things up if needed
            await instance.mount({
                "package.json": {
                    file: {
                        contents: JSON.stringify(
                            {
                                name: "n0x-artifact",
                                type: "module",
                                scripts: {
                                    dev: "vite",
                                    build: "vite build",
                                },
                                dependencies: {
                                    react: "^18.2.0",
                                    "react-dom": "^18.2.0",
                                    "lucide-react": "^0.323.0",
                                },
                                devDependencies: {
                                    "@vitejs/plugin-react": "^4.2.1",
                                    vite: "^5.0.12",
                                },
                            },
                            null,
                            2
                        ),
                    },
                },
                "index.html": {
                    file: {
                        contents: `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>n0x Artifact</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
                    },
                },
                src: {
                    directory: {
                        "main.jsx": {
                            file: {
                                contents: `
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
                            },
                        },
                        "App.jsx": {
                            file: {
                                contents: `
import React from 'react';
export default function App() {
  return <div className="p-4 text-white">App is running! Edit src/App.jsx to change this.</div>;
}
`,
                            },
                        },
                    },
                },
            });

            set({ status: "ready", instance, error: null });
        } catch (e: any) {
            logger.error("WebContainer boot failed:", e);
            set({ status: "error", error: e.message || "Failed to boot WebContainer" });
        }
    },

    writeFile: async (path: string, contents: string) => {
        const { instance } = get();
        if (!instance) throw new Error("WebContainer not ready");

        const pathParts = path.split("/");
        const fileName = pathParts.pop();

        // Ensure directories exist
        if (pathParts.length > 0) {
            // Recursive directory creation is a bit complex in basic API,
            // for now assume writing mostly to root or src/
        }

        await instance.fs.writeFile(path, contents);
    },

    runCommand: async (command: string, args: string[]) => {
        const { instance } = get();
        if (!instance) throw new Error("WebContainer not ready");

        const process = await instance.spawn(command, args);

        let output = "";
        process.output.pipeTo(
            new WritableStream({
                write(data) {
                    output += data;
                    logger.debug(data);
                },
            })
        );

        const exitCode = await process.exit;
        if (exitCode !== 0) {
            throw new Error(`Command failed with exit code ${exitCode}:\n${output}`);
        }

        return output;
    },

    startDevServer: async () => {
        const { instance, runCommand } = get();
        if (!instance) throw new Error("WebContainer not ready");

        // Install dependencies
        await runCommand("npm", ["install"]);

        // Start dev server (non-blocking)
        const process = await instance.spawn("npm", ["run", "dev"]);

        process.output.pipeTo(
            new WritableStream({
                write(data) {
                    logger.debug("[Vite]", data);
                },
            })
        );
    },
}));
