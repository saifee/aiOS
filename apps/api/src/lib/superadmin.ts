import { prisma } from "@leadhunter/db";

/**
 * Platform superadmin = a person who can see every workspace. This is separate from the per-workspace
 * OWNER/ADMIN roles, which never reach outside their own tenant.
 *
 * Who is a superadmin:
 *  - if SUPERADMIN_EMAILS is set (comma-separated), exactly those accounts;
 *  - otherwise the very first account ever created (the person who ran /setup).
 */
export function superAdminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return false;
  const list = superAdminEmails();
  if (list.length) return list.includes(user.email.toLowerCase());
  const first = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return first?.id === user.id;
}

export async function requireSuperAdmin(userId: string) {
  if (!(await isSuperAdmin(userId))) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
}
