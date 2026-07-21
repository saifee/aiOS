import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101826",        // deep slate — sidebar & headings
        paper: "#F7F6F2",      // warm paper canvas
        line: "#E4E1D8",
        signal: "#1F7A5C",     // hunter green — primary actions & "live"
        signalSoft: "#E4F1EB",
        amber: "#C98A2D",      // opportunity highlights
        danger: "#B4452F",
      },
      fontFamily: { display: ["Sora", "system-ui"], body: ["Inter", "system-ui"] },
    },
  },
  plugins: [],
} satisfies Config;
