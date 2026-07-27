import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/system/pwa-register";
import { ErrorBoundary } from "@/components/system/error-boundary";
import { VercelAnalytics } from "@/components/system/vercel-analytics";
import { AnalyticsConsentBanner } from "@/components/system/analytics-consent-banner";

export const metadata: Metadata = {
    metadataBase: new URL("https://n0xth.vercel.app"),
    title: "N0X — Private Document Q&A With Citations",
    description:
        "Ask confidential documents questions in your browser and get filename/chunk citations. Local model, search, and cloud boundaries stay explicit.",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "N0X",
    },
    icons: {
        icon: "/icon.png",
        apple: "/apple-touch-icon.png",
    },
    other: {
        "mobile-web-app-capable": "yes",
    },
    openGraph: {
        title: "N0X — Private Document Q&A With Citations",
        description:
            "Ask confidential documents questions in your browser and get filename/chunk citations. Local and network paths stay explicit.",
        type: "website",
        url: "https://n0xth.vercel.app",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "N0X private document Q&A workbench",
            },
        ],
        siteName: "N0X",
    },
    twitter: {
        card: "summary_large_image",
        title: "N0X — Private Document Q&A With Citations",
        description: "Ask documents locally and verify answers with filename/chunk citations.",
        images: ["/og-image.png"],
        creator: "@ixchio",
    },
};

export const viewport: Viewport = {
    themeColor: "#0a0a0a",
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "N0X",
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Web Browser",
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
        description:
            "Local-first browser document Q&A with filename/chunk citations. Browser inference is available through WebGPU; cloud, search, image, speech, and remote-provider features can use network paths.",
        featureList: [
            "Document Q&A with filename/chunk citations",
            "Local PDF, DOCX, and text extraction",
            "BM25 retrieval for short documents and hybrid vector/keyword retrieval for larger documents",
            "Local LLM inference via WebGPU",
            "Optional Chrome AI, Ollama, and OpenAI-compatible providers",
            "Agent mode with per-call approval for agent-initiated Python",
            "Optional multi-source web search and image-generation network routes",
            "Origin-scoped conversation and optional semantic-memory storage",
            "Browser speech input/output; offline operation is not guaranteed",
        ],
        screenshot: "https://n0xth.vercel.app/og-image.png",
    };

    return (
        <html lang="en" className="dark">
            <head>
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            </head>
            <body className="bg-crt-black text-txt-primary font-sans antialiased">
                {/* Background layer */}
                <div className="fixed inset-0 z-[-1] bg-[#0a0a0a]" />
                <ErrorBoundary>{children}</ErrorBoundary>
                <AnalyticsConsentBanner />
                <PWARegister />
                <VercelAnalytics />
            </body>
        </html>
    );
}
