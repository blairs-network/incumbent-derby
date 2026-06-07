"""SQLAlchemy ORM models for Incumbent Derby."""

import datetime
from sqlalchemy import Integer, String, Text, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Derby(Base):
    __tablename__ = "derbies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    goal: Mapped[str] = mapped_column(String(255), nullable=False)
    judges: Mapped[int] = mapped_column(Integer, default=5)
    max_rounds: Mapped[int] = mapped_column(Integer, default=5)
    stop_after: Mapped[int] = mapped_column(Integer, default=2)
    mock_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(String(100), default="anthropic/claude-sonnet-4-6")
    status: Mapped[str] = mapped_column(String(20), default="done")  # queued|running|done|error
    betting_closes_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    final_decision: Mapped[str] = mapped_column(String(50), nullable=True)
    final_text: Mapped[str] = mapped_column(Text, nullable=True)
    report_json: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"Derby(id={self.id}, status={self.status}, decision={self.final_decision})"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    handle: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    entries: Mapped[int] = mapped_column(Integer, default=0)
    webhook_url: Mapped[str] = mapped_column(String(500), nullable=True)


class AgentEntry(Base):
    __tablename__ = "agent_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    derby_id: Mapped[int] = mapped_column(Integer, ForeignKey("derbies.id"), nullable=False)
    agent_handle: Mapped[str] = mapped_column(String(100), nullable=False)
    slot: Mapped[str] = mapped_column(String(10), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=True)
    won: Mapped[bool] = mapped_column(Boolean, default=False)


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    handle: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    balance: Mapped[float] = mapped_column(Float, default=1000.0)


class Bet(Base):
    __tablename__ = "bets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    derby_id: Mapped[int] = mapped_column(Integer, ForeignKey("derbies.id"), nullable=False)
    bettor_handle: Mapped[str] = mapped_column(String(100), nullable=False)
    prediction: Mapped[str] = mapped_column(String(50), nullable=False)  # CHANGE ADOPTED | KEEP ORIGINAL
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    placed_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    settled: Mapped[bool] = mapped_column(Boolean, default=False)
    won: Mapped[bool] = mapped_column(Boolean, nullable=True)
    payout: Mapped[float] = mapped_column(Float, default=0.0)
