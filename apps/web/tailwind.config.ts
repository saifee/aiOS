import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1A3A",         // deep navy — text, sidebar
        paper: "#F3F5FB",       // cool canvas
        line: "#E2E6F1",
        signal: "#3558F5",      // aiOS blue — primary actions
        signalSoft: "#E8EDFF",
        amber: "#D9822B",
        danger: "#C73E3E",
        ok: "#12906B",
      },
      fontFamily: { display: ["'Bricolage Grotesque'", "system-ui", "sans-serif"], body: ["Figtree", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(14,26,58,.05), 0 4px 16px rgba(14,26,58,.05)", lift: "0 10px 30px rgba(14,26,58,.14)" },
    },
  },
  plugins: [],
} satisfies Config;
