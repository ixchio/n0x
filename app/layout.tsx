import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "N0X — The Full AI Stack in One Browser Tab",
  description: "LLM inference, web search, RAG, code execution, image generation, memory, and TTS — all running in your browser via WebGPU. No install, no server, no account.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "N0X",
  },
};

export const viewport: Viewport = {
  themeColor: "#33ff33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-crt-black text-txt-primary font-mono antialiased">
        {/* Background layer */}
        <div className="fixed inset-0 z-[-1] bg-[#0a0a0a]" />
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
