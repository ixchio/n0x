import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Private Document Q&A Workbench | N0X",
    description:
        "Choose a document, run local retrieval, and ask questions with filename/chunk citations. Advanced tools remain available in the workbench.",
    alternates: {
        canonical: "/chat",
    },
    openGraph: {
        title: "Private Document Q&A Workbench | N0X",
        description: "Ask confidential documents questions with inspectable source citations.",
        url: "/chat",
    },
    twitter: {
        title: "Private Document Q&A Workbench | N0X",
        description: "Ask confidential documents questions with inspectable source citations.",
    },
};

export default function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return children;
}
