"""Pydantic schemas for the Incumbent Derby API."""

from __future__ import annotations

import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ── agents ────────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    handle: str


class AgentResponse(BaseModel):
    handle: str
    wins: int
    losses: int
    entries: int
    win_rate: float


class AgentEntryInput(BaseModel):
    handle: str
    text: str
    slot: str = Field(default="A", description="A (Bold Edit) | B (Surgical Edit) | AB (Hybrid Beast)")


class AgentEntryResult(BaseModel):
    handle: str
    slot: str
    won: bool


class AgentDerbyEntry(BaseModel):
    derby_id: int
    goal: str
    slot: str
    won: bool
    final_decision: Optional[str] = None
    status: str
    created_at: datetime.datetime


# ── wallets & bets ────────────────────────────────────────────────────────────

class WalletResponse(BaseModel):
    handle: str
    balance: float


class BetCreate(BaseModel):
    bettor_handle: str
    prediction: str = Field(..., description="CHANGE ADOPTED or KEEP ORIGINAL")
    amount: float = Field(gt=0, le=10000)


class BetResponse(BaseModel):
    id: int
    derby_id: int
    bettor_handle: str
    prediction: str
    amount: float
    placed_at: datetime.datetime
    settled: bool
    won: Optional[bool] = None
    payout: float = 0.0


# ── derbies ───────────────────────────────────────────────────────────────────

class DerbyCreate(BaseModel):
    original_text: str
    goal: str
    judges: int = Field(default=5, ge=1, le=15)
    max_rounds: int = Field(default=5, ge=1, le=10)
    stop_after: int = Field(default=2, ge=1, le=5)
    mock_mode: bool = Field(default=False)
    model: str = Field(default="anthropic/claude-sonnet-4-6")
    async_mode: bool = Field(default=False)
    betting_window: int = Field(default=30, ge=0, le=300, description="Seconds for betting before race starts")
    agent_entries: List[AgentEntryInput] = Field(default_factory=list)


class Candidate(BaseModel):
    name: str
    text: str


class JudgeRanking(BaseModel):
    judge: int
    lens: str
    ranking: List[str]


class RoundReport(BaseModel):
    index: int
    candidates: Dict[str, Candidate]
    rankings: List[JudgeRanking]
    points: Dict[str, int]
    winner: str
    winner_name: str
    incumbent_won: bool


class DerbyReport(BaseModel):
    changed: bool
    final_text: str
    rounds: List[RoundReport]
    stop_reason: str


class DerbySummary(BaseModel):
    id: int
    created_at: datetime.datetime
    goal: str
    status: str = "done"
    final_decision: Optional[str] = None


class DerbyResponse(BaseModel):
    id: int
    created_at: datetime.datetime
    original_text: str
    goal: str
    judges: int
    max_rounds: int
    stop_after: int
    mock_mode: bool
    model: str = "anthropic/claude-sonnet-4-6"
    status: str = "done"
    betting_closes_at: Optional[datetime.datetime] = None
    final_decision: Optional[str] = None
    final_text: Optional[str] = None
    report: Optional[DerbyReport] = None
    agent_entries: List[AgentEntryResult] = Field(default_factory=list)
