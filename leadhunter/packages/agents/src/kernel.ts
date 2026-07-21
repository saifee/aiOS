import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@leadhunter/db";
import { TOOLS, toolSpecs, ToolCtx } from "./tools";
import { AGENT_REGISTRY } from "./registry";
import { searchKnowledge, remember } from "./memory";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

/**
 * The AI-OS kernel. Every department agent runs through here:
 *  1. Load its role definition (system prompt + allowed tools) from the registry
 *  2. Pull relevant context from the Knowledge Brain
 *  3. Run a Claude tool-use loop — the agent calls tools until it's done
 *  4. Persist the run (audit), remember the outcome, return the result
 * Sensitive tools route through the human-approval gate automatically.
 */
export async function runAgent(params: { businessId: string; role: string; input: Record<string, unknown>; trigger?: string }) {
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
Services: ${(business?.services ?? []).join(", ")}
Languages: ${(business?.languages ?? ["en"]).join(", ")} (reply in the language the task/customer uses)
Tone: ${business?.tone ?? "professional"}

## Relevant knowledge
${knowledge.map((k: any) => `- ${k.title || k.source}: ${k.content.slice(0, 300)}`).join("\n") || "(no prior knowledge retrieved)"}

## Operating rules
- Use tools to actually get work done; don't just describe what you would do.
- Anything sensitive (sending contracts, spending money, issuing refunds, deploying, deleting data) MUST go through request_approval first.
- Hand work to other departments with message_agent. Emit events with emit_event so the org stays in sync.
- Be truthful and grounded. Never invent client facts, prices, or commitments.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: JSON.stringify(params.input) }];
  const toolLog: any[] = [];
  let tokensIn = 0, tokensOut = 0, finalText = "";

  for (let step = 0; step < 8; step++) {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 1500, system,
      tools: toolSpecs(def.tools), messages,
    });
    tokensIn += resp.usage.input_tokens; tokensOut += resp.usage.output_tokens;
    finalText = resp.content.filter((c) => c.type === "text").map((c: any) => c.text).join("\n") || finalText;

    const toolUses = resp.content.filter((c) => c.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolUses.length === 0) break;

    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = TOOLS[tu.name];
      let out: unknown;
      try {
        out = tool ? await tool.handler(tool.schema.parse(tu.input), ctx) : { error: "unknown tool" };
      } catch (e: any) { out = { error: String(e.message) }; }
      toolLog.push({ name: tu.name, input: tu.input, result: out });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 4000) });
    }
    messages.push({ role: "user", content: results });
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
