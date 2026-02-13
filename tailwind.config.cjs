/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // N0X Retro CRT palette
        crt: {
          black: "#000000",
          bg: "#030303",
          surface: "#0a0a0a",
          border: "#1a1a1a",
          hover: "#111111",
          panel: "#060606",
        },
        phosphor: {
          DEFAULT: "#33ff33",    // Classic CRT green
          dim: "#1a8a1a",       // Muted green
          bright: "#66ff66",    // Highlight green
          glow: "#00ff00",      // Pure glow
          text: "#22cc22",      // Readable green
          faint: "#0d4d0d",     // Very subtle green
        },
        neon: {
          cyan: "#00ffff",
          magenta: "#ff00ff",
          pink: "#ff3399",
          amber: "#ffaa00",
        },
        txt: {
          primary: "#cccccc",
          secondary: "#666666",
          tertiary: "#333333",
        },
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
        pixel: ["'Press Start 2P'", "monospace"],
      },
      boxShadow: {
        "glow-green": "0 0 10px rgba(51, 255, 51, 0.3), 0 0 20px rgba(51, 255, 51, 0.1)",
        "glow-cyan": "0 0 10px rgba(0, 255, 255, 0.3)",
        "glow-sm": "0 0 5px rgba(51, 255, 51, 0.2)",
      },
      animation: {
        "blink": "blink 1s step-end infinite",
        "scanline": "scanline 8s linear infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        "flicker": "flicker 0.15s infinite",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flicker: {
          "0%": { opacity: "0.97" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0.98" },
        },
      },
    },
  },
  plugins: [],
};
