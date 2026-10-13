import { PrismaClient, Prisma } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
export * from "@prisma/client";

/** MySQL has no array columns: list fields are stored as JSON. `arr()` reads them back as a typed array (null/garbage -> []). */
export function arr<T = string>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

/**
 * Find a lead whose JSON list column (emails / phones) contains `value`.
 * Explicit SQL (JSON_CONTAINS) — works on MySQL 5.7+/8 and MariaDB 10.4+.
 */
export async function findLeadByListValue(field: "emails" | "phones", value: string, where: { businessId?: string } = {}) {
  const col = Prisma.raw(field === "emails" ? "emails" : "phones"); // whitelisted above — never user input
  const biz = where.businessId ? Prisma.sql`AND businessId = ${where.businessId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM ${Prisma.raw("`Lead`")} WHERE JSON_CONTAINS(${col}, JSON_QUOTE(${value})) ${biz} LIMIT 1`
  );
  return rows[0] ? prisma.lead.findUnique({ where: { id: rows[0].id } }) : null;
}
