export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id="aiosg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5B7CFF" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#aiosg)" />
      <path d="M9 21.5 14 10.5l5 11M10.8 18h6.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="23.2" cy="12" r="1.6" fill="#fff" /><path d="M23.2 15v6.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
export function Wordmark({ light = false }: { light?: boolean }) {
  return <span className={`font-display text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}>ai<span className="text-signal">OS</span></span>;
}
