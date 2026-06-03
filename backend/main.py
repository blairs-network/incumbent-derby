"""FastAPI application for Incumbent Derby.

Sync path: POST /derbies (async_mode=false) — blocks until done, returns full report.
Async path: POST /derbies (async_mode=true) — queues the race, returns immediately.
  Spectators connect to GET /derbies/{id}/events (SSE) to watch live.
  Bettors POST /derbies/{id}/bets before betting_closes_at.
"""

import asyncio
import datetime
import json
import os
import random as _random
from contextlib import asynccontextmanager
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import schemas
from .db import Base, SessionLocal, engine, get_db
from .logic import run_tournament
from .model_backends import resolve_model
from .models import Agent, AgentEntry, Bet, Derby, Wallet

load_dotenv()
Base.metadata.create_all(bind=engine)

# ── async state ───────────────────────────────────────────────────────────────

_queue: asyncio.Queue = None
_loop: asyncio.AbstractEventLoop = None
_subscribers: dict[int, list[asyncio.Queue]] = {}


async def _emit(derby_id: int, event: dict):
    data = json.dumps(event)
    for q in list(_subscribers.get(derby_id, [])):
        await q.put(data)


async def _settle(derby_id: int, changed: bool):
    verdict = "CHANGE ADOPTED" if changed else "KEEP ORIGINAL"
    db = SessionLocal()
    try:
        bets = db.query(Bet).filter(Bet.derby_id == derby_id, Bet.settled == False).all()
        if not bets:
            return
        winners = [b for b in bets if b.prediction == verdict]
        losers = [b for b in bets if b.prediction != verdict]
        loser_pool = sum(b.amount for b in losers)
        winner_pool = loser_pool * 0.9  # 10% rake
        winner_stakes = sum(b.amount for b in winners) or 1
        for bet in bets:
            if bet.prediction == verdict:
                bet.payout = bet.amount + winner_pool * (bet.amount / winner_stakes)
                bet.won = True
            else:
                bet.payout = 0.0
                bet.won = False
            bet.settled = True
            wallet = db.query(Wallet).filter(Wallet.handle == bet.bettor_handle).first()
            if not wallet:
                wallet = Wallet(handle=bet.bettor_handle)
                db.add(wallet)
            wallet.balance += bet.payout
        db.commit()
    finally:
        db.close()


async def _run_derby(derby_id: int):
    db = SessionLocal()
    derby = db.get(Derby, derby_id)
    if not derby:
        db.close()
        return

    goal = derby.goal
    original = derby.original_text
    mock = derby.mock_mode
    model_spec = getattr(derby, "model", "anthropic/claude-sonnet-4-6") or "anthropic/claude-sonnet-4-6"
    params = dict(max_rounds=derby.max_rounds, n_judges=derby.judges, stop_after=derby.stop_after,
                  seed=0 if mock else _random.randint(0, 2 ** 31))
    entries = db.query(AgentEntry).filter(AgentEntry.derby_id == derby_id).all()
    external = {e.slot: e.text for e in entries if e.text} or None
    db.close()

    # Honour the betting window
    db = SessionLocal()
    derby = db.get(Derby, derby_id)
    closes_at = getattr(derby, "betting_closes_at", None)
    db.close()
    if closes_at:
        wait = (closes_at - datetime.datetime.utcnow()).total_seconds()
        if wait > 0:
            await _emit(derby_id, {"type": "betting_open", "closes_in": round(wait)})
            await asyncio.sleep(wait)

    db = SessionLocal()
    derby = db.get(Derby, derby_id)
    derby.status = "running"
    db.commit()
    db.close()
    await _emit(derby_id, {"type": "started"})

    try:
        model = resolve_model(model_spec, mock=mock)
    except ValueError as e:
        await _emit(derby_id, {"type": "error", "message": str(e)})
        return

    def on_round(rd):
        asyncio.run_coroutine_threadsafe(_emit(derby_id, {"type": "round", "round": rd}), _loop)

    try:
        changed, final_text, rounds, stop_reason = await _loop.run_in_executor(
            None, lambda: run_tournament(model, goal, original,
                                         external_candidates=external, on_round=on_round, **params)
        )
    except Exception as e:
        await _emit(derby_id, {"type": "error", "message": str(e)})
        db = SessionLocal()
        derby = db.get(Derby, derby_id)
        derby.status = "error"
        db.commit()
        db.close()
        return

    final_decision = "CHANGE ADOPTED" if changed else "KEEP ORIGINAL"
    report = {"changed": changed, "final_text": final_text, "rounds": rounds, "stop_reason": stop_reason}

    await _settle(derby_id, changed)

    db = SessionLocal()
    derby = db.get(Derby, derby_id)
    derby.status = "done"
    derby.final_decision = final_decision
    derby.final_text = final_text
    derby.report_json = json.dumps(report)
    # Update agent entries win/loss
    first_winner = rounds[0]["winner"] if rounds else None
    for entry in db.query(AgentEntry).filter(AgentEntry.derby_id == derby_id).all():
        won = entry.slot == first_winner
        entry.won = won
        agent = db.query(Agent).filter(Agent.handle == entry.agent_handle).first()
        if agent:
            agent.entries += 1
            if won:
                agent.wins += 1
            else:
                agent.losses += 1
    db.commit()
    db.close()

    await _emit(derby_id, {"type": "done", "changed": changed, "final_text": final_text,
                            "final_decision": final_decision, "stop_reason": stop_reason})
    _subscribers.pop(derby_id, None)


async def _worker():
    while True:
        derby_id = await _queue.get()
        try:
            await _run_derby(derby_id)
        except Exception as e:
            print(f"[worker] derby {derby_id} crashed: {e}")
        finally:
            _queue.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _queue, _loop
    _loop = asyncio.get_running_loop()
    _queue = asyncio.Queue()
    worker = asyncio.create_task(_worker())
    yield
    worker.cancel()
    try:
        await worker
    except asyncio.CancelledError:
        pass


# ── app ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Incumbent Derby", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _upsert_agent(handle: str, db: Session) -> Agent:
    agent = db.query(Agent).filter(Agent.handle == handle).first()
    if not agent:
        agent = Agent(handle=handle)
        db.add(agent)
        db.flush()
    return agent


def _agent_resp(a: Agent) -> schemas.AgentResponse:
    return schemas.AgentResponse(handle=a.handle, wins=a.wins, losses=a.losses, entries=a.entries,
                                  win_rate=a.wins / a.entries if a.entries else 0.0)


def _derby_resp(derby: Derby, report: Optional[dict] = None,
                agent_entries: Optional[List] = None) -> schemas.DerbyResponse:
    done = derby.status == "done"
    return schemas.DerbyResponse(
        id=derby.id,
        created_at=derby.created_at,
        original_text=derby.original_text,
        goal=derby.goal,
        judges=derby.judges,
        max_rounds=derby.max_rounds,
        stop_after=derby.stop_after,
        mock_mode=derby.mock_mode,
        model=getattr(derby, "model", "anthropic/claude-sonnet-4-6") or "anthropic/claude-sonnet-4-6",
        status=getattr(derby, "status", "done") or "done",
        betting_closes_at=getattr(derby, "betting_closes_at", None),
        final_decision=derby.final_decision if done else None,
        final_text=derby.final_text if done else None,
        report=schemas.DerbyReport(**report) if report and done else None,
        agent_entries=agent_entries or [],
    )


# ── health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


# ── agents ────────────────────────────────────────────────────────────────────

@app.post("/agents", response_model=schemas.AgentResponse)
def upsert_agent(payload: schemas.AgentCreate, db: Session = Depends(get_db)):
    agent = _upsert_agent(payload.handle, db)
    db.commit()
    db.refresh(agent)
    return _agent_resp(agent)


@app.get("/agents", response_model=List[schemas.AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    return [_agent_resp(a) for a in db.query(Agent).order_by(Agent.wins.desc()).all()]


@app.get("/agents/{handle}", response_model=schemas.AgentResponse)
def get_agent(handle: str, db: Session = Depends(get_db)):
    a = db.query(Agent).filter(Agent.handle == handle).first()
    if not a:
        raise HTTPException(404, "Agent not found")
    return _agent_resp(a)


@app.get("/agents/{handle}/derbies", response_model=List[schemas.AgentDerbyEntry])
def agent_derbies(handle: str, limit: int = 20, db: Session = Depends(get_db)):
    results = (
        db.query(AgentEntry, Derby)
        .join(Derby, AgentEntry.derby_id == Derby.id)
        .filter(AgentEntry.agent_handle == handle)
        .order_by(Derby.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        schemas.AgentDerbyEntry(
            derby_id=e.derby_id,
            goal=d.goal,
            slot=e.slot,
            won=bool(e.won),
            final_decision=d.final_decision if d.final_decision != "PENDING" else None,
            status=getattr(d, "status", "done") or "done",
            created_at=d.created_at,
        )
        for e, d in results
    ]


# ── wallets ───────────────────────────────────────────────────────────────────

@app.get("/wallets/{handle}", response_model=schemas.WalletResponse)
def get_wallet(handle: str, db: Session = Depends(get_db)):
    w = db.query(Wallet).filter(Wallet.handle == handle).first()
    if not w:
        w = Wallet(handle=handle)
        db.add(w)
        db.commit()
        db.refresh(w)
    return schemas.WalletResponse(handle=w.handle, balance=w.balance)


# ── derbies ───────────────────────────────────────────────────────────────────

@app.post("/derbies", response_model=schemas.DerbyResponse)
def create_derby(payload: schemas.DerbyCreate, db: Session = Depends(get_db)):
    if payload.async_mode:
        closes_at = (datetime.datetime.utcnow() + datetime.timedelta(seconds=payload.betting_window)
                     if payload.betting_window > 0 else None)
        derby = Derby(
            original_text=payload.original_text, goal=payload.goal,
            judges=payload.judges, max_rounds=payload.max_rounds, stop_after=payload.stop_after,
            mock_mode=payload.mock_mode, model=payload.model,
            status="queued", betting_closes_at=closes_at,
            final_decision="PENDING", final_text="", report_json="null",
        )
        db.add(derby)
        db.flush()
        for e in payload.agent_entries:
            _upsert_agent(e.handle, db)
            db.add(AgentEntry(derby_id=derby.id, agent_handle=e.handle, slot=e.slot, text=e.text))
        db.commit()
        db.refresh(derby)
        if _queue is None or _loop is None:
            raise HTTPException(503, "Server is still starting up — retry in a moment")
        asyncio.run_coroutine_threadsafe(_queue.put(derby.id), _loop)
        return _derby_resp(derby)

    # Synchronous path (backward compat, tests, direct API callers)
    try:
        model = resolve_model(payload.model, mock=payload.mock_mode)
    except ValueError as e:
        raise HTTPException(400, str(e))

    external = {e.slot: e.text for e in payload.agent_entries} if payload.agent_entries else None
    seed = 0 if payload.mock_mode else _random.randint(0, 2 ** 31)
    changed, final_text, rounds, stop_reason = run_tournament(
        model, payload.goal, payload.original_text,
        max_rounds=payload.max_rounds, n_judges=payload.judges,
        stop_after=payload.stop_after, seed=seed, external_candidates=external,
    )
    final_decision = "CHANGE ADOPTED" if changed else "KEEP ORIGINAL"
    report = {"changed": changed, "final_text": final_text, "rounds": rounds, "stop_reason": stop_reason}

    derby = Derby(
        original_text=payload.original_text, goal=payload.goal,
        judges=payload.judges, max_rounds=payload.max_rounds, stop_after=payload.stop_after,
        mock_mode=payload.mock_mode, model=payload.model, status="done",
        final_decision=final_decision, final_text=final_text, report_json=json.dumps(report),
    )
    db.add(derby)
    db.flush()

    first_winner = rounds[0]["winner"] if rounds else None
    entries_out = []
    for e in payload.agent_entries:
        won = e.slot == first_winner
        agent = _upsert_agent(e.handle, db)
        agent.entries += 1
        if won:
            agent.wins += 1
        else:
            agent.losses += 1
        db.add(AgentEntry(derby_id=derby.id, agent_handle=e.handle, slot=e.slot, text=e.text, won=won))
        entries_out.append(schemas.AgentEntryResult(handle=e.handle, slot=e.slot, won=won))

    db.commit()
    db.refresh(derby)
    return _derby_resp(derby, report, entries_out)


@app.get("/derbies/{derby_id}/events")
async def derby_events(derby_id: int, db: Session = Depends(get_db)):
    derby = db.get(Derby, derby_id)
    if not derby:
        raise HTTPException(404, "Derby not found")

    sse_headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no",
                   "Access-Control-Allow-Origin": "*"}

    status = getattr(derby, "status", "done") or "done"

    if status == "done" and derby.report_json and derby.report_json not in ("null", None):
        async def replay():
            rep = json.loads(derby.report_json)
            for r in rep.get("rounds", []):
                yield f"data: {json.dumps({'type': 'round', 'round': r})}\n\n"
                await asyncio.sleep(0.05)
            yield f"data: {json.dumps({'type': 'done', 'changed': rep['changed'], 'final_text': rep['final_text'], 'final_decision': derby.final_decision, 'stop_reason': rep['stop_reason']})}\n\n"
        return StreamingResponse(replay(), media_type="text/event-stream", headers=sse_headers)

    async def live():
        q: asyncio.Queue = asyncio.Queue()
        _subscribers.setdefault(derby_id, []).append(q)
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=45)
                    yield f"data: {data}\n\n"
                    event = json.loads(data)
                    if event.get("type") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            lst = _subscribers.get(derby_id, [])
            if q in lst:
                lst.remove(q)

    return StreamingResponse(live(), media_type="text/event-stream", headers=sse_headers)


@app.post("/derbies/{derby_id}/bets", response_model=schemas.BetResponse)
def place_bet(derby_id: int, payload: schemas.BetCreate, db: Session = Depends(get_db)):
    derby = db.get(Derby, derby_id)
    if not derby:
        raise HTTPException(404, "Derby not found")
    status = getattr(derby, "status", "done") or "done"
    if status not in ("queued", "running"):
        raise HTTPException(400, "Betting is closed — race has already ended")
    closes_at = getattr(derby, "betting_closes_at", None)
    if closes_at and datetime.datetime.utcnow() > closes_at:
        raise HTTPException(400, "Betting window has closed")
    if payload.prediction not in ("CHANGE ADOPTED", "KEEP ORIGINAL"):
        raise HTTPException(400, "prediction must be 'CHANGE ADOPTED' or 'KEEP ORIGINAL'")

    wallet = db.query(Wallet).filter(Wallet.handle == payload.bettor_handle).first()
    if not wallet:
        wallet = Wallet(handle=payload.bettor_handle)
        db.add(wallet)
        db.flush()
    if wallet.balance < payload.amount:
        raise HTTPException(400, f"Insufficient chips: have {wallet.balance:.0f}, need {payload.amount:.0f}")
    wallet.balance -= payload.amount

    bet = Bet(derby_id=derby_id, bettor_handle=payload.bettor_handle,
              prediction=payload.prediction, amount=payload.amount)
    db.add(bet)
    db.commit()
    db.refresh(bet)
    return schemas.BetResponse(
        id=bet.id, derby_id=bet.derby_id, bettor_handle=bet.bettor_handle,
        prediction=bet.prediction, amount=bet.amount, placed_at=bet.placed_at,
        settled=bet.settled, won=bet.won, payout=bet.payout,
    )


@app.get("/derbies/{derby_id}/bets", response_model=List[schemas.BetResponse])
def list_bets(derby_id: int, bettor: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Bet).filter(Bet.derby_id == derby_id)
    if bettor:
        q = q.filter(Bet.bettor_handle == bettor)
    return [schemas.BetResponse(
        id=b.id, derby_id=b.derby_id, bettor_handle=b.bettor_handle,
        prediction=b.prediction, amount=b.amount, placed_at=b.placed_at,
        settled=b.settled, won=b.won, payout=b.payout,
    ) for b in q.all()]


@app.get("/derbies/{derby_id}", response_model=schemas.DerbyResponse)
def get_derby(derby_id: int, db: Session = Depends(get_db)):
    derby = db.get(Derby, derby_id)
    if not derby:
        raise HTTPException(404, "Derby not found")
    report = None
    if derby.report_json and derby.report_json not in ("null", None):
        report = json.loads(derby.report_json)
    entries = [schemas.AgentEntryResult(handle=e.agent_handle, slot=e.slot, won=e.won)
               for e in db.query(AgentEntry).filter(AgentEntry.derby_id == derby_id).all()]
    return _derby_resp(derby, report, entries)


@app.get("/derbies", response_model=List[schemas.DerbySummary])
def list_derbies(status: Optional[str] = None, db: Session = Depends(get_db)):
    ALL_SLOTS = ["A", "B", "AB"]
    q = db.query(Derby).order_by(Derby.created_at.desc())
    if status:
        q = q.filter(Derby.status == status)
    rows = q.all()
    result = []
    for d in rows:
        d_status = getattr(d, "status", "done") or "done"
        taken, open_slots = [], []
        if d_status == "queued":
            taken = [e.slot for e in db.query(AgentEntry).filter(AgentEntry.derby_id == d.id).all()]
            open_slots = [s for s in ALL_SLOTS if s not in taken]
        result.append(schemas.DerbySummary(
            id=d.id, created_at=d.created_at, goal=d.goal,
            status=d_status,
            final_decision=d.final_decision if d.final_decision != "PENDING" else None,
            original_text=d.original_text if d_status == "queued" else None,
            model=getattr(d, "model", None) if d_status == "queued" else None,
            betting_closes_at=getattr(d, "betting_closes_at", None) if d_status == "queued" else None,
            slots_taken=taken,
            slots_open=open_slots,
        ))
    return result


@app.get("/derbies/{derby_id}/entries", response_model=List[schemas.AgentEntryResult])
def list_entries(derby_id: int, db: Session = Depends(get_db)):
    entries = db.query(AgentEntry).filter(AgentEntry.derby_id == derby_id).all()
    return [schemas.AgentEntryResult(handle=e.agent_handle, slot=e.slot, won=bool(e.won)) for e in entries]


@app.post("/derbies/{derby_id}/entries", response_model=schemas.AgentEntryResult, status_code=201)
def submit_entry(derby_id: int, payload: schemas.AgentEntryInput, db: Session = Depends(get_db)):
    derby = db.get(Derby, derby_id)
    if not derby:
        raise HTTPException(404, "Derby not found")
    d_status = getattr(derby, "status", "done") or "done"
    if d_status != "queued":
        raise HTTPException(400, f"Entry closed — derby is already {d_status}")
    closes_at = getattr(derby, "betting_closes_at", None)
    if closes_at and datetime.datetime.utcnow() > closes_at:
        raise HTTPException(400, "Entry window has closed")
    if payload.slot not in ("A", "B", "AB"):
        raise HTTPException(400, "slot must be A, B, or AB")
    existing = db.query(AgentEntry).filter(
        AgentEntry.derby_id == derby_id, AgentEntry.slot == payload.slot
    ).first()
    if existing:
        raise HTTPException(409, f"Slot {payload.slot} already claimed by {existing.agent_handle}")
    _upsert_agent(payload.handle, db)
    db.add(AgentEntry(derby_id=derby_id, agent_handle=payload.handle, slot=payload.slot, text=payload.text))
    db.commit()
    return schemas.AgentEntryResult(handle=payload.handle, slot=payload.slot, won=False)


# ── static frontend (production) ──────────────────────────────────────────────

_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
