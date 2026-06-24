import type { MetadataRoute } from "next";

const baseUrl = "https://n0xth.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = [
        "",
        "/chat",
        "/privacy",
        "/security",
        "/compatibility",
        "/known-limitations",
        "/webgpu-llm-browser",
        "/browser-rag",
        "/private-pdf-ai",
    ];

    return routes.map(route => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "weekly" : "monthly",
        priority: route === "" ? 1 : route === "/chat" ? 0.9 : 0.7,
    }));
}
