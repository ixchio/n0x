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
        background: "#0a0a0a",
        foreground: "#ededed",
        card: {
          DEFAULT: "#141414",
          foreground: "#ededed",
        },
        popover: {
          DEFAULT: "#141414",
          foreground: "#ededed",
        },
        primary: {
          DEFAULT: "#ededed",
          foreground: "#0a0a0a",
        },
        secondary: {
          DEFAULT: "#27272a",
          foreground: "#ededed",
        },
        muted: {
          DEFAULT: "#27272a",
          foreground: "#a1a1aa",
        },
        accent: {
          DEFAULT: "#27272a",
          foreground: "#ededed",
        },
        border: "#222222",
        input: "#27272a",
        ring: "#d4d4d8",

        // Legacy colors mapped to modern minimalist palette to prevent immediate breakage
        crt: {
          black: "#000000",
          bg: "#0a0a0a",
          surface: "#141414",
          border: "#222222",
          hover: "#1f1f1f",
          panel: "#141414",
        },
        phosphor: {
          DEFAULT: "#ededed",    // White text instead of green
          dim: "#a1a1aa",       // Muted gray
          bright: "#ffffff",    // Pure white
          glow: "#ffffff",      // Pure white
          text: "#ededed",
          faint: "#27272a",
        },
        neon: {
          cyan: "#60a5fa",    // subtle blue
          magenta: "#c084fc", // subtle purple
          pink: "#f472b6",    // subtle pink
          amber: "#fbbf24",   // subtle amber
        },
        txt: {
          primary: "#ededed",
          secondary: "#a1a1aa",
          tertiary: "#52525b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
      },
      boxShadow: {
        "glow-white": "0 0 10px rgba(255, 255, 255, 0.1), 0 0 20px rgba(255, 255, 255, 0.05)",
        "glass": "inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "in": "in 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        in: {
          "0%": { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        }
      },
    },
  },
  plugins: [],
};
