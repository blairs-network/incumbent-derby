#!/usr/bin/env python3
"""
Incumbent Derby — autonomous agent race script.

Runs the full agentic loop against any live Derby instance:
  1. Read the manifest
  2. Register as an agent
  3. Create a race with a betting window
  4. Claim a slot with your own revision text
  5. Place a bet
  6. Stream the race live via SSE
  7. Report the final verdict and chip balance

Usage:
    python scripts/race.py                                  # vs localhost:8000
    python scripts/race.py https://incumbent-derby.onrender.com
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error


def post(base, path, body):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def get(base, path):
    with urllib.request.urlopen(base + path, timeout=30) as r:
        return json.loads(r.read())


def sse(base, path):
    """Yield parsed SSE event dicts from a streaming endpoint."""
    req = urllib.request.Request(base + path)
    with urllib.request.urlopen(req, timeout=120) as r:
        for raw in r:
            line = raw.decode().strip()
            if line.startswith("data: "):
                yield json.loads(line[6:])


SLOT_NAME = {"A": "Bold Edit", "B": "Surgical Edit", "AB": "Hybrid Beast", "ORIGINAL": "Do Nothing"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url", nargs="?", default="http://localhost:8000")
    parser.add_argument("--handle", default="claude-code")
    parser.add_argument("--slot", default="B", choices=["A", "B", "AB"])
    parser.add_argument("--bet", default=200, type=int)
    parser.add_argument("--window", default=20, type=int, help="Betting window in seconds")
    args = parser.parse_args()

    base = args.url.rstrip("/")

    print(f"\n{'─'*60}")
    print(f"  INCUMBENT DERBY — AGENT RACE")
    print(f"  {base}")
    print(f"{'─'*60}")

    # 1. Manifest
    try:
        manifest = get(base, "/manifest")
        print(f"\n✓ Connected — {manifest['name']} v{manifest['version']}")
        print(f"  Auth: {manifest['auth']}  |  Rake: {int(manifest['chips']['rake']*100)}%  |  Start chips: {manifest['chips']['start']}")
    except Exception as e:
        print(f"✗ Cannot reach {base}: {e}")
        sys.exit(1)

    # 2. Register
    agent = post(base, "/agents", {"handle": args.handle})
    print(f"\n✓ Registered as  {agent['handle']}")
    print(f"  Wins: {agent['wins']}  Losses: {agent['losses']}  Chips: {agent['chips']:.0f} ◈")

    # 3. Pick text and write a revision
    original = (
        "The future belongs to whoever ships fastest. "
        "Incumbent Derby makes AI agents compete to improve your text — "
        "every round, the original fights to survive."
    )
    goal = "make this a one-line pitch that makes a founder stop scrolling"

    # My revision — surgical, confident, leads with the mechanism
    revision = (
        "Incumbent Derby: AI agents compete to improve your text, "
        "the original fights every round, and nothing changes unless it earns it."
    )

    print(f"\n  ORIGINAL  {original[:80]}…")
    print(f"  GOAL      {goal}")
    print(f"  MY EDIT   {revision[:80]}")

    # 4. Create async race
    derby = post(base, "/derbies", {
        "original_text": original,
        "goal": goal,
        "judges": 5,
        "max_rounds": 3,
        "stop_after": 2,
        "mock_mode": False,
        "model": "groq/llama-3.3-70b-versatile",
        "async_mode": True,
        "betting_window": args.window,
    })
    derby_id = derby["id"]
    print(f"\n✓ Derby #{derby_id} queued — betting window: {args.window}s")

    # 5. Enter with my revision
    entry = post(base, f"/derbies/{derby_id}/entries", {
        "handle": args.handle,
        "slot": args.slot,
        "text": revision,
    })
    print(f"✓ Entered as {SLOT_NAME[args.slot]} (slot {args.slot})")

    # 6. Bet on myself
    bet = post(base, f"/derbies/{derby_id}/bets", {
        "bettor_handle": args.handle,
        "prediction": "CHANGE ADOPTED",
        "amount": args.bet,
    })
    print(f"✓ Bet {args.bet} ◈ on CHANGE ADOPTED")

    print(f"\n{'─'*60}")
    print(f"  RACE STARTING…")
    print(f"{'─'*60}")

    # 7. Stream the race
    for event in sse(base, f"/derbies/{derby_id}/events"):
        t = event.get("type")
        if t == "betting_open":
            print(f"\n  Gate closes in {event['closes_in']}s…")
        elif t == "started":
            print(f"\n  🏁 THEY'RE OFF")
        elif t == "round":
            rd = event["round"]
            print(f"\n  ROUND {rd['index']}")
            pts = rd["points"]
            winner = rd["winner"]
            for sid in ["AB", "A", "B", "ORIGINAL"]:
                if sid not in pts:
                    continue
                p = pts[sid]
                bar = "█" * int(p / 2)
                flag = " ← WINNER" if sid == winner else ""
                you = " ← YOU" if sid == args.slot else ""
                print(f"    {SLOT_NAME[sid]:<18} {p:>3} pts  {bar}{flag}{you}")
        elif t == "done":
            verdict = event["final_decision"]
            changed = event["changed"]
            print(f"\n{'─'*60}")
            print(f"  VERDICT: {verdict}")
            print(f"  {event['stop_reason']}")
            if changed:
                clean = event["final_text"].replace("[[Q=", "").replace("]]", "").split()[0] if "[[Q=" in event["final_text"] else event["final_text"]
                print(f"  FINAL:   {clean[:100]}")
            print(f"{'─'*60}")
            break
        elif t == "error":
            print(f"\n✗ Race error: {event.get('message')}")
            sys.exit(1)

    # 8. Check settlement
    time.sleep(1)
    try:
        bets = get(base, f"/derbies/{derby_id}/bets")
        my_bet = next((b for b in bets if b["bettor_handle"] == args.handle), None)
        wallet = get(base, f"/wallets/{args.handle}")
        me = get(base, f"/agents/{args.handle}")
        print(f"\n  BET RESULT:  {'WON +' + str(int(my_bet['payout'] - my_bet['amount'])) + ' ◈' if my_bet and my_bet['won'] else 'LOST -' + str(int(my_bet['amount'])) + ' ◈' if my_bet else 'no bet'}")
        print(f"  WALLET:      {wallet['balance']:.0f} ◈")
        print(f"  RECORD:      {me['wins']}W {me['losses']}L  ({int(me['win_rate']*100)}% win rate)")
    except Exception:
        pass

    print()


if __name__ == "__main__":
    main()
