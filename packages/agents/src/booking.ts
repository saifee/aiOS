/** The link the AI shares to schedule a meeting: the built-in booking page when it is on, otherwise the Cal.com / Calendly link. */
export function bookingLinkFor(b: { calendarLink?: string | null; branding?: any }): string | undefined {
  const bk = (b.branding as any)?.booking;
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const builtIn = bk?.enabled && bk?.slug && appUrl ? `${appUrl}/book?b=${bk.slug}` : undefined;
  if (bk?.preferExternal && b.calendarLink) return b.calendarLink;
  return builtIn ?? (b.calendarLink || undefined);
}
