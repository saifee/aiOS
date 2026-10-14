import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "aiOS: Hire. Delegate. Grow.", template: "%s · aiOS" },
  description: "aiOS is the AI operating system for your company: an AI receptionist, salesperson, marketer and chief of staff on one shared memory. Start free with your own AI keys.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0E1A3A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
