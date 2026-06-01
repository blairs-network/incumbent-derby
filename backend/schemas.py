"""Pydantic schemas used by the API to validate input and shape responses."""

from __future__ import annotations

import datetime
from typing import List, Dict, Optional

from pydantic import BaseModel, Field


class AgentEntryInput(BaseModel):
    """An external agent's revision submission for a derby."""
    handle: str = Field(..., description="Agent identifier")
    text: str = Field(..., description="The revision text to compete with")
    slot: str = Field(default="A", description="Candidate slot to enter: A (Bold Edit), B (Surgical Edit), or AB (Hybrid Beast)")


class AgentEntryResult(BaseModel):
    """Result of an agent's entry after the tournament."""
    handle: str
    slot: str
    won: bool


class AgentCreate(BaseModel):
    handle: str = Field(..., description="Unique agent handle")


class AgentResponse(BaseModel):
    handle: str
    wins: int
    losses: int
    entries: int
    win_rate: float


class DerbyCreate(BaseModel):
    """Request body for creating a new derby."""

    original_text: str = Field(..., description="The original text to revise")
    goal: str = Field(..., description="The goal for the revision")
    judges: int = Field(default=5, ge=1, le=15, description="Number of judges in the panel")
    max_rounds: int = Field(default=5, ge=1, le=10, description="Maximum number of rounds")
    stop_after: int = Field(default=2, ge=1, le=5, description="Consecutive incumbent wins to stop")
    mock_mode: bool = Field(default=False, description="Use the deterministic mock model")
    agent_entries: List[AgentEntryInput] = Field(default_factory=list, description="External agent revision submissions")


class Candidate(BaseModel):
    """One runner in a round: its racing name and its text."""
    name: str
    text: str


class JudgeRanking(BaseModel):
    """One judge's anonymized ranking, translated back to real candidate ids."""
    judge: int
    lens: str
    ranking: List[str]


class RoundReport(BaseModel):
    """A single tournament round."""
    index: int
    candidates: Dict[str, Candidate]
    rankings: List[JudgeRanking]
    points: Dict[str, int]
    winner: str
    winner_name: str
    incumbent_won: bool


class DerbyReport(BaseModel):
    """Full report of a derby run."""
    changed: bool
    final_text: str
    rounds: List[RoundReport]
    stop_reason: str


class DerbySummary(BaseModel):
    """Summary information for listing derbies."""
    id: int
    created_at: datetime.datetime
    goal: str
    final_decision: str


class DerbyResponse(BaseModel):
    """Return value for the create and fetch endpoints."""
    id: int
    created_at: datetime.datetime
    original_text: str
    goal: str
    judges: int
    max_rounds: int
    stop_after: int
    mock_mode: bool
    final_decision: str
    final_text: str
    report: DerbyReport
    agent_entries: List[AgentEntryResult] = Field(default_factory=list)
