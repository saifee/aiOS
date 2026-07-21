/**
 * Meeting scheduling. Simplest robust path: share the business's booking link
 * (Cal.com / Calendly / Google appointment page) in conversation; booking
 * webhooks confirm meetings. Direct API creation supported for Cal.com.
 */
export async function createCalComBooking(args: { eventTypeId: number; start: string; name: string; email: string; timeZone: string }) {
  const res = await fetch("https://api.cal.com/v2/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CALCOM_API_KEY}`, "Content-Type": "application/json", "cal-api-version": "2024-08-13" },
    body: JSON.stringify({ eventTypeId: args.eventTypeId, start: args.start, attendee: { name: args.name, email: args.email, timeZone: args.timeZone } }),
  });
  if (!res.ok) throw new Error(`Cal.com ${res.status}: ${await res.text()}`);
  return res.json();
}
