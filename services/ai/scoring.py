"""Hybrid lead scoring: deterministic rules (fast, cheap, explainable)
blended with an LLM read of the company's website/context."""
import json

from llm import complete_json

WEIGHTS = {
    "industry_match": 20, "size_fit": 10, "growth": 10, "recent_hiring": 5,
    "geo_fit": 10, "tech_signals": 10, "website_quality": 5, "pain_points": 15,
    "buying_intent": 10, "recency": 5, "decision_maker": 10,  # >100 cap applied
}

def rule_score(business: dict, lead: dict) -> dict:
    s = {}
    industries = [i.lower() for i in business.get("industries", [])]
    s["industry_match"] = WEIGHTS["industry_match"] if lead.get("industry") and any(
        i in (lead["industry"] or "").lower() or (lead["industry"] or "").lower() in i for i in industries
    ) else 8 if lead.get("industry") else 5

    emp = lead.get("employeeCount")
    lo, hi = business.get("sizeMin"), business.get("sizeMax")
    if emp and (lo or hi):
        s["size_fit"] = WEIGHTS["size_fit"] if (not lo or emp >= lo) and (not hi or emp <= hi) else 3
    else:
        s["size_fit"] = 5

    s["decision_maker"] = WEIGHTS["decision_maker"] if lead.get("hasVerifiedContact") else 3
    s["recency"] = WEIGHTS["recency"] if lead.get("createdDaysAgo", 99) <= 7 else 2
    growth = lead.get("growthSignals") or {}
    s["growth"] = WEIGHTS["growth"] if growth else 0
    s["recent_hiring"] = WEIGHTS["recent_hiring"] if lead.get("source") == "jobs" else 0
    s["geo_fit"] = WEIGHTS["geo_fit"]  # discovery already geo-filters
    return s

def score_lead(business: dict, lead: dict) -> dict:
    s = rule_score(business, lead)

    # LLM layer only when we have website text to read
    llm_part = {"pain_points": [], "potential_need": "", "website_quality": 3, "tech_signals": 5, "buying_intent": 3}
    excerpt = (lead.get("websiteExcerpt") or "")[:6000]
    if excerpt:
        try:
            llm_part = complete_json(
                "You are a B2B sales analyst. Assess fit strictly from the evidence given. Never invent facts.",
                json.dumps({
                    "our_business": business,
                    "prospect": {k: lead.get(k) for k in ("companyName", "industry", "city", "country", "techStack")},
                    "prospect_website_text": excerpt,
                    "task": {
                        "pain_points": "list up to 4 likely pain points our services address, grounded in the website text",
                        "potential_need": "one sentence on why they might need us (or why not)",
                        "website_quality": f"0-{WEIGHTS['website_quality']}",
                        "tech_signals": f"0-{WEIGHTS['tech_signals']} (existing software / stack relevance)",
                        "buying_intent": f"0-{WEIGHTS['buying_intent']}",
                    },
                }),
            )
        except Exception:
            pass

    s["website_quality"] = min(int(llm_part.get("website_quality", 3)), WEIGHTS["website_quality"])
    s["tech_signals"] = min(int(llm_part.get("tech_signals", 5)), WEIGHTS["tech_signals"])
    s["buying_intent"] = min(int(llm_part.get("buying_intent", 3)), WEIGHTS["buying_intent"])
    s["pain_points"] = min(len(llm_part.get("pain_points", [])) * 4, WEIGHTS["pain_points"])

    total = min(sum(s.values()), 100)
    return {
        "score": total,
        "confidence": 80 if excerpt else 55,
        "breakdown": s,
        "potentialNeed": llm_part.get("potential_need", ""),
        "painPoints": llm_part.get("pain_points", [])[:4],
    }
