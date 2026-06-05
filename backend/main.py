from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import JSONResponse
from pydantic import BaseModel
import anthropic
import pandas as pd
import io
import logging
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

from rules import analyze, clean_title

load_dotenv()

logger = logging.getLogger("feedback")

_supabase_url = os.getenv("SUPABASE_URL")
_supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(_supabase_url, _supabase_key) if _supabase_url and _supabase_key else None

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Logistics Title Mapper API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: JSONResponse(
    status_code=429,
    content={"detail": "Too many requests. Please slow down and try again shortly."}
))
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    title: str
    description: str = ""
    country: str = ""

class BulkAnalyzeRequest(BaseModel):
    rows: list[AnalyzeRequest]

class CleanPreviewRequest(BaseModel):
    titles: list[str]

class FeedbackRequest(BaseModel):
    rating: str                  # "up" or "down"
    title: str = ""              # 被分類的職稱
    result: str = ""             # 分到哪個 domain
    comment: str = ""
    page: str = ""
    confidence: int | None = None
    status: str | None = None    # Good match / Review recommended / Low confidence / Out of scope
    out_of_scope: bool | None = None

class WaitlistRequest(BaseModel):
    email: str
    plan: str = "general"
    source: str = "landing_page"

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []   # [{role: "user"|"assistant", content: "..."}]
    context: str = ""          # optional: JSON string of current analysis results


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _log_titles(rows: list[dict]):
    """Background task: batch-insert title + result to Supabase for training data."""
    if not supabase:
        return
    try:
        records = [
            {
                "title":       r.get("raw_title", ""),
                "clean_title": r.get("clean_title", ""),
                "domain":      r.get("domain", ""),
                "confidence":  r.get("confidence", 0),
                "ai_used":     r.get("ai_used", False),
            }
            for r in rows
        ]
        if records:
            supabase.table("title_log").insert(records).execute()
    except Exception as e:
        logger.error("Supabase title_log insert failed: %s", e)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/analyze")
@limiter.limit("60/minute")
def analyze_single(request: Request, req: AnalyzeRequest, background_tasks: BackgroundTasks):
    result = analyze(req.title, req.description, req.country)
    background_tasks.add_task(_log_titles, [result])
    return result


PLAN_LIMITS = {"guest": 100, "basic": 1_000, "pro": 10_000}

@app.post("/bulk-analyze")
@limiter.limit("10/minute")
def bulk_analyze(request: Request, req: BulkAnalyzeRequest, background_tasks: BackgroundTasks):
    # Determine plan limit from token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer ") and supabase:
        token = auth_header.split(" ", 1)[1]
        try:
            user_resp = supabase.auth.get_user(token)
            user_id = user_resp.user.id
            plan_resp = supabase.table("user_plans").select("plan").eq("user_id", user_id).single().execute()
            plan = plan_resp.data.get("plan", "basic") if plan_resp.data else "basic"
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")
    else:
        plan = "guest"

    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["guest"])
    if len(req.rows) > limit:
        raise HTTPException(
            status_code=403,
            detail=f"Your {plan} plan supports up to {limit} rows per upload. This request has {len(req.rows)} rows."
        )

    results = [analyze(r.title, r.description, r.country) for r in req.rows]
    background_tasks.add_task(_log_titles, results)
    return results


@app.post("/upload")
@limiter.limit("20/minute")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """
    Accept CSV or XLSX, return parsed rows for the frontend
    to map columns before sending to /bulk-analyze.
    """
    content = await file.read()
    filename = file.filename or ""

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content), dtype=str).fillna("")
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported.")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    return {
        "headers": list(df.columns),
        "rows": df.to_dict(orient="records"),
        "total": len(df),
    }


@app.post("/clean-preview")
@limiter.limit("20/minute")
def clean_preview(request: Request, req: CleanPreviewRequest):
    """
    Step 1 of the paid bulk flow:
    Return before/after pairs so the user can review cleaning
    before classification runs.
    """
    return [
        {"raw": t, "clean": clean_title(t)}
        for t in req.titles
    ]


_CHAT_SYSTEM = """You are a logistics HR specialist assistant for Logititles — a job title normalization tool for NZ and AU.

Rules for every response:
- Max 80 words. No exceptions.
- Reply in the same language the user writes in. If they write in Chinese, reply in Chinese. If English, reply in English.
- Lead with the direct answer in 1–2 sentences.
- When listing items (e.g. domains, roles), place each item on its own line starting with "- ". Use a real line break (newline) before each item. Never write list items inline separated by spaces.
- No bold text. No section headers. No follow-up questions.
- Skip the caveats unless critical.

Logititles classifies roles into 9 domains: Warehouse, Transport, Freight Forwarding, Planning, Operations, Finance, Sales, IT Support, Business Administration.

Help with: classification results, confidence scores, salary benchmarks (NZ/AU estimates only), logistics terminology, and what to do with out-of-scope results.

Data awareness rules:
- Out-of-scope rows are not logistics roles — always exclude them from domain/skill counts and say so explicitly ("excluding out-of-scope rows").
- Low-confidence rows (under 55%) should be flagged for review, not treated as reliable data.
- Never estimate or invent salary figures for out-of-scope or low-confidence rows — say "salary unavailable" instead."""


@app.post("/chat")
@limiter.limit("30/minute")
def chat_endpoint(request: Request, req: ChatRequest):
    # Verify Supabase JWT
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = auth_header.split(" ", 1)[1]
    if not supabase:
        raise HTTPException(status_code=503, detail="Auth service unavailable.")
    try:
        supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI Assistant is not available.")
    try:
        client = anthropic.Anthropic(api_key=api_key)
        first_content = req.message
        if req.context:
            first_content = f"Context from my current analysis:\n{req.context}\n\nMy question: {req.message}"
        messages = req.history + [{"role": "user", "content": first_content}]
        trimmed = messages[-8:] if len(messages) > 8 else messages
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=_CHAT_SYSTEM,
            messages=trimmed,
        )
        reply = resp.content[0].text.strip()
        # If AI returned inline list items (3+ " - " separators), convert to newline-separated
        if "\n-" not in reply and reply.count(" - ") >= 3:
            reply = reply.replace(" - ", "\n- ")
        return {"reply": reply}
    except Exception as e:
        logger.error("Chat error: %s", e)
        raise HTTPException(status_code=500, detail="AI Assistant error. Please try again.")


@app.post("/waitlist")
@limiter.limit("5/minute")
def join_waitlist(request: Request, req: WaitlistRequest):
    if supabase:
        try:
            supabase.table("waitlist").insert({
                "email":  req.email,
                "plan":   req.plan,
                "source": req.source,
            }).execute()
        except Exception as e:
            logger.error("Supabase waitlist insert failed: %s", e)
    return {"ok": True}


@app.post("/feedback")
@limiter.limit("20/minute")
def submit_feedback(request: Request, req: FeedbackRequest):
    ts = datetime.now(timezone.utc).isoformat()
    logger.info("FEEDBACK | %s | rating=%s | title=%s | result=%s | page=%s | comment=%s",
                ts, req.rating, req.title, req.result, req.page, req.comment)

    if supabase:
        try:
            record = {
                "title":        req.title,
                "result":       req.result,
                "rating":       req.rating,
                "comment":      req.comment,
                "page":         req.page,
            }
            if req.confidence  is not None: record["confidence"]  = req.confidence
            if req.status      is not None: record["status"]      = req.status
            if req.out_of_scope is not None: record["out_of_scope"] = req.out_of_scope
            supabase.table("feedback").insert(record).execute()
        except Exception as e:
            logger.error("Supabase feedback insert failed: %s", e)

    return {"ok": True}
