# AI Operating System — architecture

The platform is not a bag of features; it's a kernel with pluggable AI employees.

## The kernel (`packages/agents`)
| File | Role |
|---|---|
| `kernel.ts` | Runs any agent: loads its role, grounds it in the Knowledge Brain, runs a Claude tool-use loop, logs the run, writes memory. |
| `registry.ts` | The org chart — every department's system prompt + allowed tools. Add a department = add an entry. |
| `tools.ts` | The agents' hands: CRM, knowledge search, email/WhatsApp, meetings, tasks, proposals, invoices, inter-agent messaging, events, and the human-approval gate. |
| `memory.ts` | Shared memory + Knowledge Brain (pgvector cosine search). |
| `bus.ts` | Event-driven backbone: `publishEvent`, `dispatchAgent`, `sendAgentMessage` over BullMQ. |
| `orchestrator.ts` | Routes domain events to the departments that should react; delivers inter-agent messages. |

## How work flows
```
command / event / schedule / another agent
        │
        ▼
   dispatchAgent → agent-run queue → runAgent()
        │                                  │ tools
        │                                  ▼
        │                    CRM · Knowledge · Email/WhatsApp · Meetings ·
        │                    Tasks · Proposals · Invoices · message_agent ·
        │                    emit_event · request_approval (human gate)
        ▼
  emit_event ──► orchestration queue ──► routeEvent ──► wakes other departments
```

## Departments (27 registered)
Executive (CEO Assistant, Executive Reporting), Front Office (Receptionist),
Sales, Customer Success, Delivery (Project Manager), Product, Engineering
(CTO, Backend, Frontend, Mobile, QA, DevOps, Security), Design (UI/UX),
Creative (Graphic Designer, Video Creator), Marketing, Growth (Business
Development, Autonomous Growth Agent), Finance, People (HR/Recruitment),
Legal, Procurement, Operations (Knowledge Brain), Intelligence (Analytics).

## What runs today vs. integration points
- **Runs today** (with API keys): CEO Assistant + Command Center, Sales, Customer Success, Project Manager, Finance (invoicing/chasing), Growth, Executive Reporting, Knowledge Brain, Receptionist voice bridge, all CRM/comms/meeting/task tools, event routing, human approvals, audit logging.
- **Integration points** (agent reasons + briefs today; the "hands" plug into a provider): Graphic Designer → image-gen API; Video Creator → video/avatar render API; Backend/Frontend/Mobile/QA/DevOps → a code-execution sandbox + Git/CI. Each is a registered agent with the right prompt and tools; wiring the provider is a contained task, not a rebuild.

## Add a new AI employee
1. Add an entry to `AGENT_REGISTRY` (displayName, department, systemPrompt, tools).
2. If it needs a new capability, add a `Tool` in `tools.ts`.
3. Optionally add event routes in `orchestrator.ts` so it reacts automatically.
That's it — the kernel, memory, audit, and UI pick it up.
