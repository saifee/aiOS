"""LLM router: Claude primary, OpenAI fallback, JSON-mode helpers."""
import json
import os
import re

import anthropic

_client = None

def claude():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client

def complete_json(system: str, user: str, max_tokens: int = 1200) -> dict:
    """Ask for strict JSON and parse defensively."""
    msg = claude().messages.create(
        model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5"),
        max_tokens=max_tokens,
        system=system + "\nRespond ONLY with valid JSON. No markdown fences, no preamble.",
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.M).strip()
    return json.loads(text)

def complete_text(system: str, user: str, max_tokens: int = 800) -> str:
    msg = claude().messages.create(
        model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5"),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if b.type == "text")
