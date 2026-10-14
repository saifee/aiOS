import { vi } from "vitest";
/** In-memory prisma double: just enough surface for tenant/IDOR/webhook negative tests. */
export const db = {
  membership: { findFirst: vi.fn() },
  business: { findFirst: vi.fn(), findUnique: vi.fn() },
  notification: { findMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
  tenant: { create: vi.fn() },
  agent: { upsert: vi.fn() },
  call: { create: vi.fn(), updateMany: vi.fn() },
  lead: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  meeting: { create: vi.fn() },
  message: { create: vi.fn(), updateMany: vi.fn() },
  activity: { create: vi.fn() },
  suppression: { upsert: vi.fn() },
  integration: { findMany: vi.fn(), upsert: vi.fn() },
};

