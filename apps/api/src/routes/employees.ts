import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { EMPLOYEES, ROUTINES, runRoutine, fleetReport } from "@leadhunter/agents";

const db: any = prisma;

/** AI Employees: switch roles on, run a routine now, read and review what they drafted. They only draft; the owner does the last click. */
export async function employeeRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));
  const biz = async (req: any) => { const { businessId } = req.params as any; await app.requireBusiness(req, businessId); return businessId as string; };

  app.get("/businesses/:businessId/employees", async (req) => {
    const businessId = await biz(req);
    const [settings, runs, fleet] = await Promise.all([
      db.employeeSetting.findMany({ where: { businessId } }),
      db.employeeRun.findMany({ where: { businessId }, orderBy: { startedAt: "desc" }, take: 200, select: { id: true, routine: true, status: true, startedAt: true, error: true, state: true, title: true } }),
      fleetReport(businessId),
    ]);
    const on = new Map<string, any>(settings.map((s: any) => [s.employee, s]));
    const all = on.get("_all")?.config ?? {};
    return {
      config: { website: all.website ?? "", maxRunsPerDay: all.maxRunsPerDay ?? 12 },
      fleet: { ok: fleet.rows.filter((r) => r.status === "ok").length, attention: fleet.bad, total: fleet.rows.length, issues: fleet.rows.filter((r) => ["failed", "blocked", "stale"].includes(r.status)).map((r) => ({ employee: r.employee, title: r.title, status: r.status, error: r.error })) },
      employees: EMPLOYEES.map((e) => ({
        id: e.id, name: e.name, role: e.role, blurb: e.blurb, color: e.color, needsWebsite: !!e.needsWebsite, enabled: !!on.get(e.id)?.enabled,
        routines: e.routines.map((r) => { const last = runs.find((x: any) => x.routine === r.id); return { id: r.id, title: r.title, blurb: r.blurb, days: r.cadence.days, hour: r.cadence.hour, period: r.cadence.period, ai: !r.noAi, last: last ?? null }; }),
      })),
    };
  });

  app.put("/businesses/:businessId/employees/:employee", async (req, reply) => {
    const businessId = await biz(req); app.requireRole(req, "OWNER", "ADMIN");
    const { employee } = req.params as any;
    if (employee === "_all") {
      const b = z.object({ website: z.union([z.string().trim().max(300).regex(/^(https?:\/\/)?[A-Za-z0-9.-]+(:\d+)?(\/[^\s]*)?$/, "Enter a website address such as example.com"), z.literal("")]).optional(), maxRunsPerDay: z.number().int().min(1).max(40).optional() }).strict().parse(req.body);
      const cur = (await db.employeeSetting.findUnique({ where: { businessId_employee: { businessId, employee: "_all" } } }))?.config ?? {};
      const config = { ...cur, ...b };
      await db.employeeSetting.upsert({ where: { businessId_employee: { businessId, employee: "_all" } }, update: { config }, create: { businessId, employee: "_all", enabled: false, config } });
      return { ok: true, config };
    }
    if (!EMPLOYEES.some((e) => e.id === employee)) return reply.code(404).send({ error: "Unknown employee" });
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    await db.employeeSetting.upsert({ where: { businessId_employee: { businessId, employee } }, update: { enabled }, create: { businessId, employee, enabled } });
    return { ok: true, enabled };
  });

  // Run now. Takes as long as the AI answer does (usually a few seconds).
  app.post("/businesses/:businessId/employees/routines/:routine/run", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (req, reply) => {
    const businessId = await biz(req); app.requireRole(req, "OWNER", "ADMIN", "MEMBER");
    const { routine } = req.params as any;
    if (!ROUTINES[routine]) return reply.code(404).send({ error: "Unknown routine" });
    const r = await runRoutine(businessId, routine, { trigger: "manual" });
    const row = r.id ? await db.employeeRun.findUnique({ where: { id: r.id } }) : null;
    return row;
  });

  app.get("/businesses/:businessId/employees/runs", async (req) => {
    const businessId = await biz(req);
    const q = z.object({ employee: z.string().max(40).optional(), state: z.enum(["new", "done", "dismissed"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(req.query);
    return db.employeeRun.findMany({ where: { businessId, status: { in: ["ok", "failed", "blocked"] }, ...(q.employee && { employee: q.employee }), ...(q.state && { state: q.state }) }, orderBy: { startedAt: "desc" }, take: q.limit });
  });

  app.patch("/businesses/:businessId/employees/runs/:runId", async (req, reply) => {
    const businessId = await biz(req);
    const { runId } = req.params as any; const { state } = z.object({ state: z.enum(["new", "done", "dismissed"]) }).strict().parse(req.body);
    const r = await db.employeeRun.updateMany({ where: { id: runId, businessId }, data: { state } });
    return r.count ? { ok: true } : reply.code(404).send({ error: "Not found" });
  });
}
