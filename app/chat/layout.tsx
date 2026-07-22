import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "N0X Workspace — Local AI Chat, Docs and Tools",
    description:
        "Use local models, private document retrieval, code tools, and explicit provider controls. Local by default. Search, image and cloud paths are explicit.",
    alternates: {
        canonical: "/chat",
    },
    openGraph: {
        title: "N0X Workspace — Local AI Chat, Docs and Tools",
        description: "Local by default. Search, image and cloud paths are explicit.",
        url: "/chat",
    },
    twitter: {
        title: "N0X Workspace — Local AI Chat, Docs and Tools",
        description: "Local by default. Search, image and cloud paths are explicit.",
    },
};

export default function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return children;
}
