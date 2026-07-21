"""AI conversation agent: intent classification + grounded reply + escalation.
The agent answers only from configured business facts; anything it can't
answer confidently is escalated to a human."""
import json

from llm import complete_json

INTENTS = ["question", "pricing", "objection", "interested", "meeting", "not_interested", "unsubscribe", "other"]

def handle_reply(payload: dict) -> dict:
    out = complete_json(
        """You are a sales assistant continuing a real conversation on behalf of a business.
Rules:
- Ground every statement in the provided business facts. If asked something you don't know (pricing details, technical specifics, contracts), say a colleague will follow up — and set escalate=true.
- Follow the pricingPolicy exactly.
- If they want a meeting, share the calendar link if provided.
- Match the prospect's language.
- Be brief, warm, and honest. Never pressure.
Respond only with JSON.""",
        json.dumps({
            "business": payload["business"],
            "prospect": payload["lead"],
            "conversation_history": payload["history"][-12:],
            "new_inbound_message": payload["inbound"],
            "output": {
                "intent": f"one of {INTENTS}",
                "reply": "the message to send back (plain text)",
                "escalate": "boolean — true if a human must take over (custom quote, negotiation, complaint, anything uncertain)",
                "escalate_reason": "short reason if escalate",
                "stage_hint": "optional CRM stage: INTERESTED | MEETING_SCHEDULED | NEGOTIATION | LOST",
            },
        }),
        max_tokens=800,
    )
    out.setdefault("escalate", False)
    if out.get("intent") not in INTENTS:
        out["intent"] = "other"
    return out
