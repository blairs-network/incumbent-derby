"""Core tournament logic for Incumbent Derby."""

from __future__ import annotations

import json
import random
import re
from typing import Callable, Dict, List, Optional, Tuple

from .model_backends import AnthropicModel, MockModel  # re-exported for backward compat

ORIGINAL, A, B, AB = "ORIGINAL", "A", "B", "AB"
RACING_NAME = {ORIGINAL: "Do Nothing", B: "Surgical Edit", A: "Bold Edit", AB: "Hybrid Beast"}
TIE_BREAK_ORDER = [ORIGINAL, B, A, AB]

JUDGE_LENSES = [
    "clarity — is the meaning immediately legible?",
    "accuracy — does it preserve what the original actually said?",
    "concision — is every word earning its place?",
    "structure — does the order of ideas serve the reader?",
    "impact — does it land for the person who has to read it?",
]

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
    ids = list(candidates.keys())
    n = len(ids)
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
        ranking = _parse_ranking(model, system, f"GOAL: {goal}\n\n{block}", expected=set(range(n)))
        if ranking is None:
            continue
        for rank_index, label in enumerate(ranking):
            points[label_to_id[label]] += (n - 1 - rank_index)
        transcript.append({
            "judge": j + 1,
            "lens": lens.split(" — ")[0],
            "ranking": [label_to_id[label] for label in ranking],
        })

    return points, transcript


def decide(points: Dict[str, int]) -> str:
    best = max(points.values())
    leaders = [i for i, p in points.items() if p == best]
    for i in TIE_BREAK_ORDER:
        if i in leaders:
            return i
    return leaders[0]


def run_tournament(
    model, goal: str, original: str,
    max_rounds: int = 5, n_judges: int = 5, stop_after: int = 2, seed: int = 0,
    external_candidates: Optional[Dict[str, str]] = None,
    on_round: Optional[Callable] = None,
) -> Tuple[bool, str, List[dict], str]:
    """Run the full Derby. on_round(round_dict) is called after each round if provided."""
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

        round_dict = {
            "index": r,
            "candidates": {i: {"name": RACING_NAME[i], "text": candidates[i]} for i in candidates},
            "rankings": transcript,
            "points": points,
            "winner": winner,
            "winner_name": RACING_NAME[winner],
            "incumbent_won": incumbent_won,
        }
        rounds.append(round_dict)

        if on_round:
            on_round(round_dict)

        if incumbent_won:
            consecutive_holds += 1
            if consecutive_holds >= stop_after:
                changed = incumbent != original.strip()
                return changed, incumbent, rounds, f"the incumbent held {stop_after} rounds running"
        else:
            consecutive_holds = 0
            incumbent = candidates[winner].strip()

    changed = incumbent != original.strip()
    return changed, incumbent, rounds, f"reached the round limit ({max_rounds})"
