# aiOS: what was borrowed, what's next

## Borrowed from the three reference projects
| Idea | Source | In aiOS now |
|---|---|---|
| Daily Must / Should / Could briefing | ai-chief-of-staff `/start` | Recipe "Morning briefing" + Overnight brief widget |
| End-of-session wrap, queue open items | ai-chief-of-staff `/wrap` | Recipe "End-of-day wrap" |
| Lanes / explicit priorities | ai-chief-of-staff | Goals widget (progress per goal) |
| Decision log | claude-chief-of-staff | Decision log widget (agents can read it) |
| Overdue-commitment tracking | claude-chief-of-staff | Recipe "Overdue promises" |
| Human-only / approval-gated / automated split | claude-chief-of-staff | Approval queue widget (already enforced in the kernel) |
| Cost visibility per agent | automatos-ai | "AI usage" widget (tokens per agent, 30 days) |
| Bring your own keys, 300+ models | automatos-ai | Settings -> AI keys with failover chain |
| Packaged team bundles / playbooks | automatos-ai | Playbooks -> Recipes (13 routines) |

## Next ideas (ordered by payoff)
1. **Recipe scheduler**: run any recipe daily or weekly and deliver the result to WhatsApp or email (the cron tick already exists).
2. **Model routing by task**: cheap/free models for scoring and drafting, a stronger model for planning. Needs a per-agent "preferred model" field next to each key.
3. **Learned rules**: when you edit an agent's draft, store the correction as a rule and inject it into that agent's prompt (chief-of-staff "calibration").
4. **Voice-first mobile**: hold a button, speak an order, get the briefing read back in Arabic or English.
5. **Team bundles**: one-click "Clinic", "Retail", "Real estate" workspaces that pre-fill business profile, recipes and dashboard.
6. **Public booking and chat widget** for customers' websites, answered by the Receptionist.
7. **Agent marketplace**: share and install custom agents and recipes between workspaces.
8. **Prompt A/B testing**: test two outreach prompts on live traffic and keep the winner.
9. **Weekly "what I learned about your business" digest** from the Knowledge Brain.
10. **Gemini tool-calling** so Gemini-only free users get full agent tool use (today Gemini answers without tools).
