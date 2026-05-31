"""FastAPI application for Incumbent Derby.

Wires together the database, tournament logic, and HTTP API. Supports a
deterministic mock mode and a real mode using the Anthropic API. Creates the
database tables on import.
"""

import json
from typing import List

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Derby
from . import schemas
from .logic import run_tournament, MockModel, AnthropicModel

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Incumbent Derby API")

# Open CORS for local dev. allow_credentials stays False so the wildcard origin
# is actually honored by browsers (credentials + "*" is rejected by the spec).
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


def _build_report(changed, final_text, rounds, stop_reason) -> dict:
    return {
        "changed": changed,
        "final_text": final_text,
        "rounds": rounds,
        "stop_reason": stop_reason,
    }


def _to_response(derby: Derby, report: dict) -> schemas.DerbyResponse:
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
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/derbies", response_model=schemas.DerbyResponse)
def create_derby(payload: schemas.DerbyCreate, db: Session = Depends(get_db)):
    """Create and run a new derby, persist it, return the full report."""
    try:
        model = get_model(payload.mock_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    changed, final_text, rounds, stop_reason = run_tournament(
        model=model,
        goal=payload.goal,
        original=payload.original_text,
        max_rounds=payload.max_rounds,
        n_judges=payload.judges,
        stop_after=payload.stop_after,
        seed=0,
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
    db.commit()
    db.refresh(derby)
    return _to_response(derby, report)


@app.get("/derbies/{derby_id}", response_model=schemas.DerbyResponse)
def get_derby(derby_id: int, db: Session = Depends(get_db)):
    derby = db.get(Derby, derby_id)
    if not derby:
        raise HTTPException(status_code=404, detail="Derby not found")
    return _to_response(derby, json.loads(derby.report_json))


@app.get("/derbies", response_model=List[schemas.DerbySummary])
def list_derbies(db: Session = Depends(get_db)):
    derbies = db.query(Derby).order_by(Derby.created_at.desc()).all()
    return [
        schemas.DerbySummary(
            id=d.id, created_at=d.created_at, goal=d.goal, final_decision=d.final_decision
        )
        for d in derbies
    ]
