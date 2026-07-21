import "./globals.css";
export const metadata = { title: "LeadHunter AI", description: "Your autonomous AI sales employee" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
