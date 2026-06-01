"""Core tournament logic for Incumbent Derby.

Adapts the original ``autoreason.py`` into functions the FastAPI backend calls.
A round generates four runners, anonymizes them, runs a blind judge panel,
aggregates by Borda count, and decides whether a change beats doing nothing.

The only swappable part is the model backend. ``MockModel`` is deterministic so
the whole product demos and tests without an API key; ``AnthropicModel`` is a
thin client over the Messages API for live runs.
"""

from __future__ import annotations

import os
import json
import random
import re
from typing import Dict, List, Tuple, Optional

import httpx


# Internal candidate ids and the racing names shown to people.
#   A  = the bold rewrite        -> "Bold Edit"
#   B  = the smallest change     -> "Surgical Edit"
#   AB = the synthesis of both   -> "Hybrid Beast"
ORIGINAL, A, B, AB = "ORIGINAL", "A", "B", "AB"
RACING_NAME = {
    ORIGINAL: "Do Nothing",
    B: "Surgical Edit",
    A: "Bold Edit",
    AB: "Hybrid Beast",
}
# Ties resolve toward less change: keep the text, then the smallest edit, etc.
TIE_BREAK_ORDER = [ORIGINAL, B, A, AB]

JUDGE_LENSES = [
    "clarity — is the meaning immediately legible?",
    "accuracy — does it preserve what the original actually said?",
    "concision — is every word earning its place?",
    "structure — does the order of ideas serve the reader?",
    "impact — does it land for the person who has to read it?",
]


class AnthropicModel:
    """Minimal client for the Anthropic Messages API.

    The model id defaults to a current Sonnet and can be overridden with the
    ``ANTHROPIC_MODEL`` environment variable. Raises if no key is set.
    """

    def __init__(self, model: Optional[str] = None, max_tokens: int = 2000):
        self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        self.max_tokens = max_tokens
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        self.api_key = api_key
        self.url = "https://api.anthropic.com/v1/messages"
        self.version = "2023-06-01"

    def complete(self, system: str, prompt: str, temperature: float = 1.0) -> str:
        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        }
        auth = (
            {"Authorization": f"Bearer {self.api_key}"}
            if self.api_key.startswith("sk-ant-si-")
            else {"x-api-key": self.api_key}
        )
        headers = {
            "content-type": "application/json",
            "anthropic-version": self.version,
            **auth,
        }
        response = httpx.post(self.url, json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        data = response.json()
        return "".join(
            block.get("text", "")
            for block in data.get("content", [])
            if block.get("type") == "text"
        ).strip()


class MockModel:
    """Deterministic backend. No network, no key, no randomness.

    Candidate text carries a hidden quality marker ``[[Q=n]]``. The panel ranks
    by it. The schedule produces the canonical demo on ANY input text:
    round 1 the Hybrid beats the original, then the new incumbent holds rounds 2
    and 3, stopping after two consecutive holds.
    """

    Q_RE = re.compile(r"\[\[Q=(-?\d+)\]\]")

    def complete(self, system: str, prompt: str, temperature: float = 1.0) -> str:
        strat_match = re.search(r"STRATEGY=(\w+)", system)
        if strat_match:
            strategy = strat_match.group(1)
            base_q = self._incumbent_q(prompt)
            if base_q <= 5:
                mapping = {"A": 5, "B": 7, "AB": 8}
            else:
                mapping = {"A": 6, "B": 7, "AB": 4}
            return f"[[Q={mapping.get(strategy, base_q)}]] {strategy} revision"
        return self._judge(prompt)

    def _read_q(self, text: str, default: int) -> int:
        m = self.Q_RE.search(text)
        return int(m.group(1)) if m else default

    def _incumbent_q(self, prompt: str) -> int:
        # Read the quality of the text being revised — the ORIGINAL block — not
        # the first marker anywhere (a Hybrid prompt also quotes its peers).
        m = re.search(r"ORIGINAL:\n(.*?)(?:\n\nCANDIDATE|\Z)", prompt, re.S)
        section = m.group(1) if m else prompt
        return self._read_q(section, default=5)

    def _judge(self, prompt: str) -> str:
        options = re.findall(r"### Option (\d+)\n(.*?)(?=\n### Option |\Z)", prompt, re.S)
        # Markerless text (a user's untagged original) defaults to mid-quality.
        scores = [(int(oid), self._read_q(text, 5)) for oid, text in options]
        ranking = [oid for oid, _ in sorted(scores, key=lambda t: (-t[1], t[0]))]
        return json.dumps({"ranking": ranking, "reason": "mock"})


GEN_SYSTEMS: Dict[str, str] = {
    A: ("STRATEGY=A. You are revising text to achieve a goal. Make the boldest "
        "defensible revision: restructure, cut, sharpen, take a position. Output "
        "ONLY the revised text, no preamble, no explanation."),
    B: ("STRATEGY=B. You are revising text to achieve a goal. Make the SMALLEST "
        "change that achieves it. Preserve the original wording wherever you can. "
        "Output ONLY the revised text, no preamble, no explanation."),
    AB: ("STRATEGY=AB. You are given an original and two candidate revisions. "
         "Produce the strongest version by combining the best of all three. "
         "Output ONLY the revised text, no preamble, no explanation."),
}


def generate(model, goal: str, original: str, strategy: str,
             peers: Optional[Dict[str, str]] = None) -> str:
    if strategy == AB and peers is not None:
        prompt = (f"GOAL: {goal}\n\nORIGINAL:\n{original}\n\n"
                  f"CANDIDATE A:\n{peers[A]}\n\nCANDIDATE B:\n{peers[B]}")
    else:
        prompt = f"GOAL: {goal}\n\nORIGINAL:\n{original}"
    return model.complete(GEN_SYSTEMS[strategy], prompt, temperature=1.0).strip()


def _parse_ranking(model, system: str, prompt: str, expected: set,
                   retries: int = 1) -> Optional[List[int]]:
    for _ in range(retries + 1):
        raw = model.complete(system, prompt, temperature=1.0)
        match = re.search(r"\{.*\}", raw, re.S)
        if match:
            try:
                ranking = json.loads(match.group(0)).get("ranking", [])
                if isinstance(ranking, list) and set(ranking) == expected:
                    return ranking
            except json.JSONDecodeError:
                pass
        prompt += "\n\nYour previous reply was not valid. Output ONLY the JSON."
    return None


def judge_panel(model, goal: str, candidates: Dict[str, str], n_judges: int,
                rng: random.Random) -> Tuple[Dict[str, int], List[dict]]:
    """Run a blind panel. Returns (borda_points, transcript).

    Each judge sees options shuffled and relabeled with integer ids, so none can
    tell which candidate is the incumbent. The transcript records each judge's
    lens and their ranking translated back to the real candidate ids.
    """
    ids = list(candidates.keys())
    n = len(ids)
    expected = set(range(n))
    points = {i: 0 for i in ids}
    transcript: List[dict] = []

    for j in range(n_judges):
        order = ids[:]
        rng.shuffle(order)
        label_to_id = {k: order[k] for k in range(n)}
        block = "\n".join(f"### Option {k}\n{candidates[label_to_id[k]]}" for k in range(n))
        lens = JUDGE_LENSES[j % len(JUDGE_LENSES)]
        system = (
            "You are an impartial judge on a blind review panel. You are shown a "
            "goal and several anonymized candidate versions, each labeled by an "
            "integer id. You do not know which is the original or who wrote any of "
            f"them. Weight your judgment toward: {lens}. Rank ALL options from best "
            "to worst for achieving the goal. Output ONLY strict JSON of the form "
            '{"ranking": [ids best to worst], "reason": "one short sentence"}.'
        )
        prompt = f"GOAL: {goal}\n\n{block}"
        ranking = _parse_ranking(model, system, prompt, expected=expected)
        if ranking is None:
            continue  # a malformed judge abstains rather than corrupt the count
        for rank_index, label in enumerate(ranking):
            points[label_to_id[label]] += (n - 1 - rank_index)
        transcript.append({
            "judge": j + 1,
            "lens": lens.split(" — ")[0],
            "ranking": [label_to_id[label] for label in ranking],
        })

    return points, transcript


def decide(points: Dict[str, int]) -> str:
    """Winner = most Borda points; ties resolve toward less change."""
    best = max(points.values())
    leaders = [i for i, p in points.items() if p == best]
    for i in TIE_BREAK_ORDER:
        if i in leaders:
            return i
    return leaders[0]


def run_tournament(model, goal: str, original: str, max_rounds: int = 5,
                   n_judges: int = 5, stop_after: int = 2,
                   seed: int = 0,
                   external_candidates: Optional[Dict[str, str]] = None) -> Tuple[bool, str, List[dict], str]:
    """Run the full Derby.

    Returns ``(changed, final_text, rounds, stop_reason)``. Each round dict
    carries the candidate texts and names, the anonymized judge transcript, the
    Borda points, and the winner.

    ``external_candidates`` maps slot ids (A, B, AB) to pre-written revision
    texts submitted by external agents. Provided slots skip model generation in
    round 1 only; subsequent rounds always generate fresh revisions from the
    incumbent.
    """
    rng = random.Random(seed)
    incumbent = original.strip()
    consecutive_holds = 0
    rounds: List[dict] = []

    for r in range(1, max_rounds + 1):
        ext = external_candidates if r == 1 else None
        cand_a = ext[A] if ext and A in ext else generate(model, goal, incumbent, A)
        cand_b = ext[B] if ext and B in ext else generate(model, goal, incumbent, B)
        cand_ab = ext[AB] if ext and AB in ext else generate(model, goal, incumbent, AB, peers={A: cand_a, B: cand_b})
        candidates = {ORIGINAL: incumbent, A: cand_a, B: cand_b, AB: cand_ab}

        points, transcript = judge_panel(model, goal, candidates, n_judges, rng)
        winner = decide(points)
        incumbent_won = winner == ORIGINAL

        rounds.append({
            "index": r,
            "candidates": {i: {"name": RACING_NAME[i], "text": candidates[i]} for i in candidates},
            "rankings": transcript,
            "points": points,
            "winner": winner,
            "winner_name": RACING_NAME[winner],
            "incumbent_won": incumbent_won,
        })

        if incumbent_won:
            consecutive_holds += 1
            if consecutive_holds >= stop_after:
                # "Do Nothing won twice" is the stop rule, not the verdict. The
                # incumbent may already be an adopted revision; the verdict is
                # whether the final text differs from what was submitted.
                changed = incumbent != original.strip()
                return changed, incumbent, rounds, f"the incumbent held {stop_after} rounds running"
        else:
            consecutive_holds = 0
            incumbent = candidates[winner].strip()

    changed = incumbent != original.strip()
    return changed, incumbent, rounds, f"reached the round limit ({max_rounds})"
