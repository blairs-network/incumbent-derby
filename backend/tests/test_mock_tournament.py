from backend.logic import run_tournament, MockModel


def test_mock_arc_on_seed():
    changed, final_text, rounds, stop_reason = run_tournament(
        MockModel(), "demonstrate the loop", "[[Q=5]] seed",
        max_rounds=5, n_judges=5, stop_after=2, seed=0,
    )
    assert changed is True
    assert rounds[0]["winner"] == "AB"
    assert rounds[1]["incumbent_won"] is True
    assert rounds[2]["incumbent_won"] is True
    assert "rounds running" in stop_reason
    assert len(rounds) == 3


def test_mock_arc_on_real_markerless_text():
    # The demo must hold for any pasted text, not just the seeded marker string.
    real = "The quarterly numbers were, in our estimation, somewhat below where we had hoped."
    changed, _, rounds, _ = run_tournament(
        MockModel(), "cut the hedging", real, max_rounds=5, n_judges=5, stop_after=2,
    )
    assert changed is True
    assert rounds[0]["winner"] == "AB"
    assert rounds[1]["incumbent_won"] and rounds[2]["incumbent_won"]
    assert len(rounds) == 3


def test_rounds_persist_candidate_text_and_rankings():
    _, _, rounds, _ = run_tournament(MockModel(), "g", "[[Q=5]] seed", n_judges=5)
    r0 = rounds[0]
    # candidate text + racing names are present for every runner
    assert set(r0["candidates"].keys()) == {"ORIGINAL", "A", "B", "AB"}
    assert r0["candidates"]["AB"]["name"] == "Hybrid Beast"
    assert r0["candidates"]["B"]["name"] == "Surgical Edit"
    assert r0["candidates"]["ORIGINAL"]["text"] == "[[Q=5]] seed"
    # anonymized judge rankings are recorded
    assert len(r0["rankings"]) == 5
    assert "ranking" in r0["rankings"][0] and "lens" in r0["rankings"][0]
