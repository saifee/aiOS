import { prisma } from "@leadhunter/db";
import { callModel, parseJson, Provider } from "./models";
import { runInSandbox, Changeset } from "./sandbox";
import { openPullRequest } from "@leadhunter/integrations";

/**
 * The multi-model developer swarm. Faithful to the vision — different models
 * own different roles, each a real callable API:
 *   Architect (Claude)   → technical plan + acceptance criteria + test command
 *   Researcher (Perplexity, optional) → web-grounded answers to open questions
 *   Coder (Claude)       → the changeset (files)
 *   Reviewer (Gemini)    → critique: issues + severity
 *   Fixer (OpenAI)       → revised changeset addressing the review
 *   QA (sandbox)         → runs tests; on failure loops back to Fixer (max 2x)
 *   Delivery             → opens a GitHub PR (human-approved) or returns files
 * Every stage is persisted to SwarmRun.stages for full traceability.
 */
export async function runSwarm(params: { businessId: string; task: string; repo?: string; context?: string }) {
  const run = await prisma.swarmRun.create({ data: { businessId: params.businessId, task: params.task, repo: params.repo, stages: [] } });
  const stages: any[] = [];
  const log = async (role: string, model: Provider | string, output: any, status?: string) => {
    stages.push({ role, model, output: typeof output === "string" ? output.slice(0, 3000) : output, at: new Date().toISOString() });
    await prisma.swarmRun.update({ where: { id: run.id }, data: { stages: stages as any, ...(status && { status }) } });
  };

  try {
    // 1. Architect
    const planRaw = await callModel("claude", {
      system: "You are a senior software architect. Produce a precise, minimal implementation plan. Respond ONLY as JSON.",
      prompt: `Task: ${params.task}\nContext: ${params.context ?? "n/a"}\nReturn JSON: { "plan": string, "files": string[], "acceptanceCriteria": string[], "openQuestions": string[], "testCommand": string|null }`,
      json: true, maxTokens: 1500,
    });
    const plan = parseJson(planRaw);
    await log("architect", "claude", plan, "running");

    // 2. Researcher (only if there are open questions and Perplexity is available)
    let research = "";
    if (plan.openQuestions?.length) {
      research = await callModel("perplexity", { system: "Answer concisely with current, sourced facts.", prompt: plan.openQuestions.join("\n"), maxTokens: 800 }).catch(() => "");
      if (research) await log("researcher", "perplexity", research);
    }

    // 3. Coder
    const codeRaw = await callModel("claude", {
      system: "You are an expert engineer. Implement the plan. Return ONLY JSON: { \"files\": [{ \"path\": string, \"content\": string }] }. Complete, runnable files — no placeholders.",
      prompt: `Plan: ${JSON.stringify(plan)}\nResearch: ${research}\nAcceptance: ${JSON.stringify(plan.acceptanceCriteria)}`,
      json: true, maxTokens: 4000,
    });
    let changeset: Changeset = parseJson(codeRaw).files ?? [];
    await log("coder", "claude", changeset.map((f) => f.path));

    // 4. Reviewer (Gemini)
    const reviewRaw = await callModel("gemini", {
      system: "You are a meticulous code reviewer. Find real bugs, security issues, and spec gaps. Respond ONLY as JSON.",
      prompt: `Task: ${params.task}\nAcceptance: ${JSON.stringify(plan.acceptanceCriteria)}\nFiles:\n${changeset.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n").slice(0, 12000)}\nReturn JSON: { "issues": [{ "severity": "high|medium|low", "file": string, "problem": string, "fix": string }], "verdict": "approve|changes_requested" }`,
      json: true, maxTokens: 1500,
    });
    const review = parseJson(reviewRaw);
    await log("reviewer", "gemini", review, "review");

    // 5. Fixer (OpenAI) — only if the reviewer requested changes
    if (review.verdict === "changes_requested" && review.issues?.length) {
      const fixedRaw = await callModel("openai", {
        system: "You are a senior engineer fixing review findings. Return the COMPLETE updated fileset. Return ONLY JSON: { \"files\": [{ \"path\": string, \"content\": string }] }.",
        prompt: `Original files:\n${JSON.stringify(changeset).slice(0, 10000)}\nReview issues to fix:\n${JSON.stringify(review.issues)}`,
        json: true, maxTokens: 4000,
      });
      changeset = parseJson(fixedRaw).files ?? changeset;
      await log("fixer", "openai", changeset.map((f) => f.path));
    }

    // 6. QA — run tests in the sandbox, loop back to Fixer on failure (max 2)
    let testResult = { passed: true, output: "skipped" };
    if (plan.testCommand) {
      await prisma.swarmRun.update({ where: { id: run.id }, data: { status: "testing" } });
      for (let attempt = 0; attempt < 3; attempt++) {
        testResult = await runInSandbox(changeset, plan.testCommand);
        await log("qa", "sandbox", { attempt, passed: testResult.passed, output: testResult.output.slice(0, 1000) });
        if (testResult.passed) break;
        const fixRaw = await callModel("openai", {
          system: "Tests failed. Fix the code so they pass. Return ONLY JSON: { \"files\": [...] } (complete fileset).",
          prompt: `Files:\n${JSON.stringify(changeset).slice(0, 10000)}\nTest output:\n${testResult.output}`,
          json: true, maxTokens: 4000,
        }).catch(() => null);
        if (fixRaw) { changeset = parseJson(fixRaw).files ?? changeset; await log("fixer", "openai", `retry ${attempt + 1}`); }
      }
    }

    // 7. Delivery — PR requires human approval (sensitive action)
    let prUrl: string | undefined;
    const branch = `swarm/${run.id.slice(-8)}`;
    if (params.repo && process.env.GITHUB_TOKEN) {
      const approval = await prisma.approval.create({
        data: { businessId: params.businessId, agentRole: "backend_engineer", action: "open_pull_request",
          summary: `Open PR to ${params.repo}: ${params.task}`, payload: { runId: run.id, repo: params.repo, branch, changeset } as any },
      });
      await prisma.swarmRun.update({ where: { id: run.id }, data: { changeset: changeset as any, branch, testOutput: testResult.output, testsPassed: testResult.passed, status: "awaiting_approval" } });
      await log("delivery", "system", { awaitingApproval: approval.id });
      return { runId: run.id, status: "awaiting_approval", approvalId: approval.id, changeset };
    }

    await prisma.swarmRun.update({ where: { id: run.id }, data: { changeset: changeset as any, testOutput: testResult.output, testsPassed: testResult.passed, prUrl, status: "done", endedAt: new Date() } });
    return { runId: run.id, status: "done", changeset, testsPassed: testResult.passed, testOutput: testResult.output };
  } catch (e: any) {
    await prisma.swarmRun.update({ where: { id: run.id }, data: { status: "failed", stages: stages as any, endedAt: new Date() } });
    throw e;
  }
}

/** Called after a human approves the PR: actually commit + open it. */
export async function deliverApprovedPR(runId: string) {
  const run = await prisma.swarmRun.findUnique({ where: { id: runId } });
  if (!run?.repo || !run.changeset) throw new Error("Nothing to deliver");
  const url = await openPullRequest(run.repo, run.branch!, `[swarm] ${run.task}`, `Automated changeset from the developer swarm.\n\nTests passed: ${run.testsPassed}`, run.changeset as any);
  await prisma.swarmRun.update({ where: { id: runId }, data: { prUrl: url, status: "done", endedAt: new Date() } });
  return url;
}
