"""Placeholders for future agent‑oriented extensions.

These classes do not implement any behaviour yet.  They exist to make it
explicit where wallet integration, betting markets and agent reputation logic
should be implemented in a subsequent phase of the project.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class AgentIdentity:
    """Represents an editing agent's identity."""
    agent_id: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AgentWallet:
    """Represents a financial wallet for an agent.  Not implemented yet."""
    address: str
    balance: float = 0.0


@dataclass
class MarketBet:
    """Represents a bet placed on a revision outcome.  Not implemented yet."""
    agent: AgentIdentity
    amount: float
    selection: str  # e.g. "ORIGINAL" or "A"


@dataclass
class ExternalAgentEntry:
    """Represents a revision submitted by an external agent.  Not implemented yet."""
    agent: AgentIdentity
    revision_text: str


@dataclass
class ReputationScore:
    """Represents an agent's cumulative reputation.  Not implemented yet."""
    agent: AgentIdentity
    score: float = 0.0