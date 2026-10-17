import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PrefsProvider } from "@/components/Prefs";

export const metadata: Metadata = {
  title: { default: "aiOS: Hire. Delegate. Grow.", template: "%s · aiOS" },
  description: "aiOS is the AI operating system for your company: an AI receptionist, salesperson, marketer and chief of staff on one shared memory. Start free with your own AI keys.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0E1A3A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Runs before first paint so the saved language/theme never flashes the wrong way.
  const boot = `(function(){try{var l=localStorage.getItem('aios_lang'),t=localStorage.getItem('aios_theme'),d=document.documentElement;if(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(l==='ar'){d.lang='ar';d.dir='rtl'}if(t==='dark')d.setAttribute('data-theme','dark')}catch(e){}})();`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: boot }} /></head>
      <body><PrefsProvider>{children}</PrefsProvider></body>
    </html>
  );
}
