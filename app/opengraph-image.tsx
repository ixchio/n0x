import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "N0X — The Full AI Stack in One Browser Tab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#0a0a0a",
                position: "relative",
                overflow: "hidden",
                fontFamily: "system-ui, sans-serif",
            }}
        >
            {/* Subtle gradient orbs */}
            <div
                style={{
                    position: "absolute",
                    top: "-120px",
                    right: "-80px",
                    width: "500px",
                    height: "500px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(96,165,250,0.08) 0%, transparent 70%)",
                }}
            />
            <div
                style={{
                    position: "absolute",
                    bottom: "-160px",
                    left: "-60px",
                    width: "400px",
                    height: "400px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)",
                }}
            />

            {/* Top border accent line */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "2px",
                    background:
                        "linear-gradient(90deg, transparent, rgba(96,165,250,0.4), rgba(168,85,247,0.3), transparent)",
                }}
            />

            {/* Content */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "60px 80px",
                    flex: 1,
                    justifyContent: "center",
                    position: "relative",
                }}
            >
                {/* Logo */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "24px",
                    }}
                >
                    <div
                        style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "10px",
                            background: "linear-gradient(135deg, #1a1a2e, #16213e)",
                            border: "1px solid #222",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "18px",
                            fontWeight: 700,
                            color: "#ededed",
                        }}
                    >
                        n0x
                    </div>
                </div>

                {/* Headline */}
                <div
                    style={{
                        fontSize: "64px",
                        fontWeight: 800,
                        color: "#ffffff",
                        lineHeight: 1.1,
                        letterSpacing: "-2px",
                        marginBottom: "8px",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <span>The full AI stack.</span>
                    <span style={{ color: "#71717a" }}>In your browser.</span>
                </div>

                {/* Subtitle */}
                <div
                    style={{
                        fontSize: "22px",
                        color: "#a1a1aa",
                        lineHeight: 1.5,
                        maxWidth: "700px",
                        marginTop: "16px",
                        marginBottom: "40px",
                    }}
                >
                    LLMs, agents, RAG, code execution, image gen — running entirely on your GPU. No server. No API keys.
                    100% private.
                </div>

                {/* Feature pills */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {[
                        { label: "WebGPU LLMs", color: "#60a5fa" },
                        { label: "ReAct Agent", color: "#a78bfa" },
                        { label: "Document RAG", color: "#34d399" },
                        { label: "Python Sandbox", color: "#fbbf24" },
                        { label: "Image Gen", color: "#f472b6" },
                        { label: "Voice I/O", color: "#fb923c" },
                    ].map(f => (
                        <div
                            key={f.label}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "8px 16px",
                                borderRadius: "20px",
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                fontSize: "15px",
                                color: "#d4d4d8",
                            }}
                        >
                            <div
                                style={{
                                    width: "7px",
                                    height: "7px",
                                    borderRadius: "50%",
                                    background: f.color,
                                }}
                            />
                            {f.label}
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom bar */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "20px 80px",
                    borderTop: "1px solid #1a1a1a",
                }}
            >
                <div style={{ fontSize: "15px", color: "#52525b" }}>WebGPU · Ollama · Cloud API</div>
                <div style={{ fontSize: "15px", color: "#52525b" }}>github.com/ixchio/n0x</div>
            </div>
        </div>,
        { ...size }
    );
}
