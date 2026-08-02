import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        // Design-system surface tokens (HSL vars set in globals.css)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Eventerz brand palette
        brand: {
          // Variable-driven so the page follows the theme; the rest of the brand
          // palette below is fixed, because a brand colour is not a surface.
          bg: "hsl(var(--brand-bg))",
          "bg-soft": "hsl(var(--brand-bg-soft))",
          purple: "#9945ff",
          violet: "#7c3aed",
          blue: "#2f80ff",
          cyan: "#22d3ee",
          green: "#14f195",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
        "3xl": "1.5rem",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #9945ff 0%, #2f80ff 45%, #22d3ee 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgba(153,69,255,0.15) 0%, rgba(47,128,255,0.12) 50%, rgba(34,211,238,0.15) 100%)",
        "grid-pattern":
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        "radial-glow":
          "radial-gradient(circle at center, var(--tw-gradient-stops))",
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(153,69,255,0.45)",
        "glow-blue": "0 0 60px -12px rgba(47,128,255,0.45)",
        "glow-cyan": "0 0 50px -12px rgba(34,211,238,0.4)",
        card: "0 8px 40px -12px rgba(0,0,0,0.6)",
        "inner-glow": "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-22px)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.85" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.25s ease-out",
        "accordion-up": "accordion-up 0.25s ease-out",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        "spin-slow": "spin-slow 24s linear infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "pulse-glow": "pulse-glow 5s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
