import random

from backend.logic import (
    decide, judge_panel, MockModel,
    ORIGINAL, A, B, AB,
)


def test_tie_break_favors_doing_nothing():
    # ORIGINAL tied at the top with the bold edit -> ORIGINAL holds.
    assert decide({ORIGINAL: 5, A: 5, B: 3, AB: 1}) == ORIGINAL


def test_tie_break_orders_by_least_change():
    # No ORIGINAL in the lead; Surgical (B) beats Bold (A) on a tie.
    assert decide({ORIGINAL: 2, A: 5, B: 5, AB: 1}) == B


def test_borda_blind_panel_recovers_true_order():
    # Hidden quality strictly orders the field; after the blind shuffle the
    # Borda totals must reflect that order, and every judge leaves a transcript.
    cands = {ORIGINAL: "[[Q=1]] o", A: "[[Q=2]] a", B: "[[Q=3]] b", AB: "[[Q=4]] ab"}
    points, transcript = judge_panel(MockModel(), "goal", cands, 5, random.Random(3))
    assert points[AB] > points[B] > points[A] > points[ORIGINAL]
    assert len(transcript) == 5
    assert all(set(t["ranking"]) == {ORIGINAL, A, B, AB} for t in transcript)


def test_borda_max_is_bounded():
    # 5 judges, 4 options, top rank worth 3 -> any single option maxes at 15.
    cands = {ORIGINAL: "[[Q=9]] o", A: "[[Q=1]] a", B: "[[Q=2]] b", AB: "[[Q=3]] ab"}
    points, _ = judge_panel(MockModel(), "goal", cands, 5, random.Random(0))
    assert points[ORIGINAL] == 15
