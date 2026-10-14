"""aiOS microservice — scoring, generation, conversation."""
import hmac, os
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Any

from scoring import score_lead
from generation import generate_email, generate_whatsapp
from conversation import handle_reply
from sop import generate_sop

def require_key(x_internal_key: str | None = Header(default=None)) -> None:
    """Optional shared-secret guard for the internal AI service (set AI_SERVICE_KEY on both sides)."""
    want = os.environ.get("AI_SERVICE_KEY")
    if want and not (x_internal_key and hmac.compare_digest(x_internal_key, want)):
        raise HTTPException(status_code=401, detail="unauthorized")

app = FastAPI(title="aiOS", version="1.0.0", dependencies=[Depends(require_key)], docs_url=None, redoc_url=None, openapi_url=None)

class ScoreReq(BaseModel):
    business: dict
    lead: dict

class GenReq(BaseModel):
    business: dict
    lead: dict
    language: str = "en"
    followUp: dict | None = None

class SopReq(BaseModel):
    business: dict
    description: str | None = None
    activity_log: list | None = None
    roles: list[str] = []

class ReplyReq(BaseModel):
    business: dict
    lead: dict
    history: list[dict]
    inbound: str

@app.get("/health", dependencies=[])
def health() -> dict[str, Any]:
    return {"ok": True}

@app.post("/score")
def score(req: ScoreReq):
    return score_lead(req.business, req.lead)

@app.post("/generate/email")
def gen_email(req: GenReq):
    return generate_email(req.model_dump())

@app.post("/generate/whatsapp")
def gen_wa(req: GenReq):
    return generate_whatsapp(req.model_dump())

@app.post("/conversation/reply")
def conv(req: ReplyReq):
    return handle_reply(req.model_dump())

@app.post("/sop/generate")
def sop(req: SopReq):
    return generate_sop(req.model_dump())
