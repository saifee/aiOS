"""Personalized outreach generation. Every message must be grounded in real,
provided facts about the prospect — the prompt forbids invented claims."""
import json

from llm import complete_json

GUARDRAILS = """Hard rules:
- Use ONLY facts provided in the input. Never invent news, numbers, names, or claims about the prospect.
- No spammy language, no false urgency, no misleading subject lines.
- Identify the sender's business honestly.
- Keep it human: short sentences, specific, zero corporate filler.
- If a calendar link is provided, offer it as a low-pressure next step."""

def generate_email(ctx: dict) -> dict:
    follow = ctx.get("followUp")
    task = (
        f"Write follow-up #{follow['attempt']} (brief, adds one new angle, references that you reached out before)."
        if follow else
        "Write a first cold outreach email that reads like a thoughtful human wrote it specifically for this company."
    )
    out = complete_json(
        f"You are an expert B2B copywriter writing on behalf of the sender business. {GUARDRAILS}",
        json.dumps({
            "sender_business": ctx["business"],
            "prospect": ctx["lead"],
            "language": ctx.get("language", "en"),
            "task": task,
            "output": {"subject": "string, <60 chars, specific not clickbait", "body_html": "string, 80-140 words, simple HTML paragraphs, greeting uses contact name if given"},
        }),
        max_tokens=900,
    )
    return {"subject": out["subject"], "body_html": out["body_html"]}

def generate_whatsapp(ctx: dict) -> dict:
    out = complete_json(
        f"You write short, friendly, professional WhatsApp business messages. {GUARDRAILS}",
        json.dumps({
            "sender_business": ctx["business"],
            "prospect": ctx["lead"],
            "language": ctx.get("language", "en"),
            "output": {"body": "string, 2-4 short lines, natural and localized, ends with a soft question"},
        }),
        max_tokens=400,
    )
    return {"body": out["body"]}
