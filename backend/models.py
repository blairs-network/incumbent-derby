"""SQLAlchemy models for the Incumbent Derby application."""

import datetime
from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Derby(Base):
    """Represents a completed tournament run."""

    __tablename__ = "derbies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    goal: Mapped[str] = mapped_column(String(255), nullable=False)
    judges: Mapped[int] = mapped_column(Integer, default=5)
    max_rounds: Mapped[int] = mapped_column(Integer, default=5)
    stop_after: Mapped[int] = mapped_column(Integer, default=2)
    mock_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    final_decision: Mapped[str] = mapped_column(String(50), nullable=False)
    final_text: Mapped[str] = mapped_column(Text, nullable=False)
    report_json: Mapped[str] = mapped_column(Text, nullable=False)

    def __repr__(self) -> str:
        return f"Derby(id={self.id}, decision={self.final_decision})"


class Agent(Base):
    """An external agent that submits revisions to compete in tournaments."""

    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    handle: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    entries: Mapped[int] = mapped_column(Integer, default=0)


class AgentEntry(Base):
    """Records an agent's participation in a specific derby."""

    __tablename__ = "agent_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    derby_id: Mapped[int] = mapped_column(Integer, ForeignKey("derbies.id"), nullable=False)
    agent_handle: Mapped[str] = mapped_column(String(100), nullable=False)
    slot: Mapped[str] = mapped_column(String(10), nullable=False)  # A, B, or AB
    won: Mapped[bool] = mapped_column(Boolean, default=False)
