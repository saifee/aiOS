"""SOP Engine — turn a described or observed process into a structured
Standard Operating Procedure the company can follow or automate."""
import json
from llm import complete_json

def generate_sop(payload: dict) -> dict:
    described = payload.get("description")
    activity = payload.get("activity_log")
    context = payload.get("business", {})
    source = "taught" if described else "observed"
    return {
        **complete_json(
            """You are an operations analyst. Convert a process into a clear, repeatable SOP.
Return JSON only:
{
 "title": short name,
 "department": one of Sales/Delivery/Finance/Marketing/Front Office/People/Operations/Engineering,
 "description": one sentence on when to use this,
 "trigger": "manual" | "event:<type>" | "schedule:<cron>",
 "steps": [{ "n": 1, "action": "imperative step", "tool": optional tool name, "owner": "human"|"agent:<role>" }],
 "automation": { "role": "<agent role that could run this end-to-end>", "input": { "task": "..." } } | null
}
Make steps concrete and ordered. If the process is fully automatable by one of our AI agents, fill "automation"; otherwise null.""",
            json.dumps({
                "our_business": context,
                "process_description": described,
                "observed_activity": activity,
                "available_agent_roles": payload.get("roles", []),
            }),
            max_tokens=1200,
        ),
        "source": source,
    }
