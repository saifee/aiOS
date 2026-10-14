import { prisma, arr } from "@leadhunter/db";
import { TOOLS, toolSpecs, ToolCtx } from "./tools";
import { AGENT_REGISTRY } from "./registry";
import { searchKnowledge, remember } from "./memory";
import { chat, Turn, withBusinessContext } from "./llm";

/**
 * The AI-OS kernel. Every department agent runs through here:
 *  1. Load its role definition (system prompt + allowed tools) from the registry
 *  2. Pull relevant context from the Knowledge Brain
 *  3. Run a Claude tool-use loop — the agent calls tools until it's done
 *  4. Persist the run (audit), remember the outcome, return the result
 * Sensitive tools route through the human-approval gate automatically.
 */
export function runAgent(params: { businessId: string; role: string; input: Record<string, unknown>; trigger?: string; userId?: string }) {
  return withBusinessContext(params.businessId, () => runAgentInner(params), params.userId);
}

async function runAgentInner(params: { businessId: string; role: string; input: Record<string, unknown>; trigger?: string }) {
  const def = AGENT_REGISTRY[params.role];
  if (!def) throw new Error(`Unknown agent role: ${params.role}`);

  const agent = await prisma.agent.upsert({
    where: { businessId_role: { businessId: params.businessId, role: params.role } },
    update: {}, create: { businessId: params.businessId, role: params.role, displayName: def.displayName },
  });
  const run = await prisma.agentRun.create({ data: { agentId: agent.id, trigger: params.trigger ?? "manual", input: params.input as any } });

  const ctx: ToolCtx = { businessId: params.businessId, agentRole: params.role };
  const business = await prisma.business.findUnique({ where: { id: params.businessId } });

  // Ground the agent in company knowledge relevant to this task
  const brief = JSON.stringify(params.input).slice(0, 500);
  const knowledge = await searchKnowledge(params.businessId, brief, 5).catch(() => []);

  const system = `${def.systemPrompt}

## Company context
${business?.name} — ${business?.description ?? ""}
Services: ${arr(business?.services).join(", ")}
Languages: ${(arr(business?.languages).length ? arr(business?.languages) : ["en"]).join(", ")} (reply in the language the task/customer uses)
Tone: ${business?.tone ?? "professional"}

## Relevant knowledge
${knowledge.map((k: any) => `- ${k.title || k.source}: ${k.content.slice(0, 300)}`).join("\n") || "(no prior knowledge retrieved)"}

## Operating rules
- Use tools to actually get work done; don't just describe what you would do.
- Anything sensitive (sending contracts, spending money, issuing refunds, deploying, deleting data) MUST go through request_approval first.
- Hand work to other departments with message_agent. Emit events with emit_event so the org stays in sync.
- Be truthful and grounded. Never invent client facts, prices, or commitments.`;

  const turns: Turn[] = [{ role: "user", text: JSON.stringify(params.input) }];
  const toolLog: any[] = [];
  let tokensIn = 0, tokensOut = 0, finalText = "";

  try {
    for (let step = 0; step < 8; step++) {
      const resp = await chat({ system, turns, tools: toolSpecs(def.tools), maxTokens: 1500 });
      tokensIn += resp.tokensIn; tokensOut += resp.tokensOut;
      finalText = resp.text || finalText;
      if (resp.calls.length === 0) break;

      turns.push({ role: "assistant", text: resp.text, calls: resp.calls });
      const results: { id: string; name: string; content: string }[] = [];
      for (const tu of resp.calls) {
        const tool = TOOLS[tu.name];
        let out: unknown;
        try {
          out = tool ? await tool.handler(tool.schema.parse(tu.input), ctx) : { error: "unknown tool" };
        } catch (e: any) { out = { error: String(e.message) }; }
        toolLog.push({ name: tu.name, input: tu.input, result: out });
        results.push({ id: tu.id, name: tu.name, content: JSON.stringify(out).slice(0, 4000) });
      }
      turns.push({ role: "tool", results });
    }
  } catch (e: any) {
    // Surface key / provider problems on the run record, then let the caller see the error
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "failed", output: { text: String(e.message) } as any, endedAt: new Date() } }).catch(() => {});
    throw e;
  }

  const awaiting = toolLog.some((t) => (t.result as any)?.status === "awaiting_approval");
  await prisma.agentRun.update({
    where: { id: run.id },
    data: { output: { text: finalText } as any, toolCalls: toolLog as any, tokensIn, tokensOut, status: awaiting ? "awaiting_approval" : "done", endedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { tenantId: business!.tenantId, actor: `agent:${params.role}`, action: "agent.run", target: agent.id, detail: { trigger: params.trigger, tools: toolLog.map((t) => t.name) } } });
  await remember(params.businessId, `[${def.displayName}] ${finalText}`.slice(0, 1000), { agentId: agent.id, kind: "episodic" }).catch(() => {});

  return { runId: run.id, text: finalText, tools: toolLog, awaitingApproval: awaiting };
}
