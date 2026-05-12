import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PWARegister } from "@/components/pwa-register";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "N0X — The Full AI Stack in One Browser Tab",
  description: "LLM inference, web search, RAG, code execution, image generation, memory, and TTS — all running in your browser via WebGPU. No install, no server, no account.",
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
    "mobile-web-app-capable": "yes"
  },
  openGraph: {
    title: "N0X — The Full AI Stack in One Browser Tab",
    description: "Run LLMs, agents, RAG, code execution, and image generation entirely in your browser. No server. No API keys. 100% private.",
    type: "website",
    url: "https://n0x.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "N0X — The Full AI Stack in One Browser Tab",
    description: "LLMs, agents, RAG, code execution, image gen — all local via WebGPU. Zero backend.",
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
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-crt-black text-txt-primary font-sans antialiased">
        {/* Background layer */}
        <div className="fixed inset-0 z-[-1] bg-[#0a0a0a]" />
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
