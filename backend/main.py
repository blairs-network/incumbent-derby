"""FastAPI application for Incumbent Derby.

Wires together the database, tournament logic, and HTTP API. Supports a
deterministic mock mode and a real mode using the Anthropic API. Creates the
database tables on import.

In production (Docker), the compiled Vite frontend is served as static files
from the same process — no separate web server needed.
"""

import json
import os
import random as _random
from typing import List

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Derby, Agent, AgentEntry
from . import schemas
from .logic import run_tournament, MockModel, AnthropicModel

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Incumbent Derby API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_model(mock_mode: bool):
    if mock_mode:
        return MockModel()
    return AnthropicModel()


def _agent_response(agent: Agent) -> schemas.AgentResponse:
    return schemas.AgentResponse(
        handle=agent.handle,
        wins=agent.wins,
        losses=agent.losses,
        entries=agent.entries,
        win_rate=agent.wins / agent.entries if agent.entries else 0.0,
    )


def _upsert_agent(handle: str, db: Session) -> Agent:
    agent = db.query(Agent).filter(Agent.handle == handle).first()
    if not agent:
        agent = Agent(handle=handle)
        db.add(agent)
        db.flush()
    return agent


def _build_report(changed, final_text, rounds, stop_reason) -> dict:
    return {
        "changed": changed,
        "final_text": final_text,
        "rounds": rounds,
        "stop_reason": stop_reason,
    }


def _to_response(derby: Derby, report: dict,
                 agent_entries: List[schemas.AgentEntryResult] = None) -> schemas.DerbyResponse:
    return schemas.DerbyResponse(
        id=derby.id,
        created_at=derby.created_at,
        original_text=derby.original_text,
        goal=derby.goal,
        judges=derby.judges,
        max_rounds=derby.max_rounds,
        stop_after=derby.stop_after,
        mock_mode=derby.mock_mode,
        final_decision=derby.final_decision,
        final_text=derby.final_text,
        report=schemas.DerbyReport(**report),
        agent_entries=agent_entries or [],
    )


# ── health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


# ── agents ────────────────────────────────────────────────────────────────────

@app.post("/agents", response_model=schemas.AgentResponse)
def upsert_agent(payload: schemas.AgentCreate, db: Session = Depends(get_db)):
    """Register an agent or return its current reputation."""
    agent = _upsert_agent(payload.handle, db)
    db.commit()
    db.refresh(agent)
    return _agent_response(agent)


@app.get("/agents", response_model=List[schemas.AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    """List all agents ranked by wins."""
    agents = db.query(Agent).order_by(Agent.wins.desc()).all()
    return [_agent_response(a) for a in agents]


@app.get("/agents/{handle}", response_model=schemas.AgentResponse)
def get_agent(handle: str, db: Session = Depends(get_db)):
    """Fetch a single agent's reputation."""
    agent = db.query(Agent).filter(Agent.handle == handle).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_response(agent)


# ── derbies ───────────────────────────────────────────────────────────────────

@app.post("/derbies", response_model=schemas.DerbyResponse)
def create_derby(payload: schemas.DerbyCreate, db: Session = Depends(get_db)):
    """Create and run a new derby, persist it, return the full report."""
    try:
        model = get_model(payload.mock_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    external = {e.slot: e.text for e in payload.agent_entries} if payload.agent_entries else None
    seed = 0 if payload.mock_mode else _random.randint(0, 2 ** 31)

    changed, final_text, rounds, stop_reason = run_tournament(
        model=model,
        goal=payload.goal,
        original=payload.original_text,
        max_rounds=payload.max_rounds,
        n_judges=payload.judges,
        stop_after=payload.stop_after,
        seed=seed,
        external_candidates=external,
    )
    final_decision = "CHANGE ADOPTED" if changed else "KEEP ORIGINAL"
    report = _build_report(changed, final_text, rounds, stop_reason)

    derby = Derby(
        original_text=payload.original_text,
        goal=payload.goal,
        judges=payload.judges,
        max_rounds=payload.max_rounds,
        stop_after=payload.stop_after,
        mock_mode=payload.mock_mode,
        final_decision=final_decision,
        final_text=final_text,
        report_json=json.dumps(report),
    )
    db.add(derby)
    db.flush()

    # Settle agent entries: a slot wins if that candidate won round 1.
    first_round_winner = rounds[0]["winner"] if rounds else None
    agent_entry_results: List[schemas.AgentEntryResult] = []
    for entry in payload.agent_entries:
        won = entry.slot == first_round_winner
        agent = _upsert_agent(entry.handle, db)
        agent.entries += 1
        if won:
            agent.wins += 1
        else:
            agent.losses += 1
        db.add(AgentEntry(derby_id=derby.id, agent_handle=entry.handle, slot=entry.slot, won=won))
        agent_entry_results.append(schemas.AgentEntryResult(handle=entry.handle, slot=entry.slot, won=won))

    db.commit()
    db.refresh(derby)
    return _to_response(derby, report, agent_entry_results)


@app.get("/derbies/{derby_id}", response_model=schemas.DerbyResponse)
def get_derby(derby_id: int, db: Session = Depends(get_db)):
    derby = db.get(Derby, derby_id)
    if not derby:
        raise HTTPException(status_code=404, detail="Derby not found")
    entries = db.query(AgentEntry).filter(AgentEntry.derby_id == derby_id).all()
    agent_entry_results = [
        schemas.AgentEntryResult(handle=e.agent_handle, slot=e.slot, won=e.won)
        for e in entries
    ]
    return _to_response(derby, json.loads(derby.report_json), agent_entry_results)


@app.get("/derbies", response_model=List[schemas.DerbySummary])
def list_derbies(db: Session = Depends(get_db)):
    derbies = db.query(Derby).order_by(Derby.created_at.desc()).all()
    return [
        schemas.DerbySummary(
            id=d.id, created_at=d.created_at, goal=d.goal, final_decision=d.final_decision
        )
        for d in derbies
    ]


# ── static frontend (production) ──────────────────────────────────────────────
# Mounted last so API routes always take priority.

_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
