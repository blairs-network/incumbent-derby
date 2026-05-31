# Incumbent Derby — CLAUDE.md

A local-first web app running a blind revision tournament where the original text is always a competitor. Every change must defeat doing nothing. If the original wins, the verdict is **KEEP ORIGINAL**.

---

## Commands

```bash
make install       # create venv + npm install
make dev           # run backend (:8000) + frontend (:5173) together
make test          # pytest backend/tests/
make backend       # backend only
make frontend      # frontend only
make clean         # rm venv, node_modules, dist, derby.db
```

Always run these from the project root (`incumbent-derby/`).

Backend venv lives at `venv/` (project root), not inside `backend/`.

---

## Stack

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Backend  | Python · FastAPI · SQLAlchemy · SQLite    |
| Frontend | React · Vite (no framework, inline styles)|
| Models   | Anthropic API (`claude-sonnet-4-6`) or MockModel |
| DB       | SQLite at `backend/derby.db` (auto-created) |

---

## Project structure

```
incumbent-derby/
├── CLAUDE.md
├── Makefile
├── .env.example
├── README.md
├── backend/
│   ├── __init__.py
│   ├── main.py          # FastAPI app + 3 endpoints
│   ├── logic.py         # tournament engine + MockModel + AnthropicModel
│   ├── db.py            # SQLAlchemy session + engine
│   ├── models.py        # Derby ORM model
│   ├── schemas.py       # Pydantic request/response shapes
│   ├── watchers.py      # file-watcher daemon (bonus feature)
│   ├── placeholders.py  # future: AgentWallet, MarketBet, ReputationScore
│   ├── requirements.txt
│   └── tests/
│       ├── test_borda.py
│       └── test_mock_tournament.py
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx      # entire UI — single file, inline styles
        └── index.css    # minimal reset only
```

---

## Architecture

### Tournament engine (`backend/logic.py`)

One round:
1. Generate three revisions from the incumbent text: **Bold (A)**, **Surgical (B)**, **Hybrid (AB)**
2. Anonymize all four runners (ORIGINAL + three revisions) with integer labels
3. Five judges rank the blind field; each judge uses a different lens (clarity, accuracy, concision, structure, impact)
4. Borda count aggregates rankings into points
5. Ties resolve toward less change: `ORIGINAL → B → A → AB`
6. If ORIGINAL wins, hold count increments; if it hits `stop_after`, tournament stops
7. If a revision wins, it becomes the new incumbent; hold count resets

The verdict compares the **final incumbent** to the **submitted original** — not just the last round winner. So adopting a change in round 1 then defending it correctly reads as **CHANGE ADOPTED**.

### Model backends

`AnthropicModel` — bare `httpx` POST to the Messages API. Model: `claude-sonnet-4-6`. Override with `ANTHROPIC_MODEL` env var.

`MockModel` — deterministic, no network. Reads hidden `[[Q=n]]` quality markers. Any unmarked text defaults to `Q=5`. Canonical arc on any input: round 1 Hybrid wins, rounds 2–3 incumbent holds, stops. Used for demo and all tests.

### API (`backend/main.py`)

```
POST /derbies        create + run a derby, return full report
GET  /derbies/{id}   fetch one derby
GET  /derbies        list recent derbies (newest first)
GET  /health         liveness check
```

### Frontend (`frontend/src/App.jsx`)

Single file. No component library. Styling is 100% inline — do not add CSS files or Tailwind. The full response arrives from `POST /derbies` and rounds are revealed one at a time via `setTimeout` to simulate a live race. The vite config proxies `/derbies` and `/health` to `:8000` so no CORS headers are needed in development.

---

## Key constraints

- **No auth** — MVP only. Do not add it.
- **No payments, wallets, or blockchain** — placeholders exist in `placeholders.py`; wire them when the spec says to.
- **stdlib + httpx only** for model calls — no Anthropic SDK.
- **No component library in the frontend** — inline styles, Source Serif 4 + IBM Plex Mono from Google Fonts, the color palette below.
- **Mock mode must stay deterministic** — the canonical arc (adopt R1, hold R2, hold R3, stop) must work on any pasted text with no API key.

### Color palette (do not change these)

```js
ink:   "#0E0E0E"   // background
panel: "#141414"   // card / input backgrounds
cream: "#F2ECE1"   // primary text
red:   "#C02020"   // winner flare, KEEP ORIGINAL verdict, live pulse dot
dim:   "#857F74"   // secondary text, labels
line:  "#26241F"   // borders, dividers
green: "#9FB87A"   // positive delta, CHANGE ADOPTED in recent list
```

### Racing names (do not change these)

| Internal id | Racing name     |
|-------------|-----------------|
| ORIGINAL    | Do Nothing      |
| B           | Surgical Edit   |
| A           | Bold Edit       |
| AB          | Hybrid Beast    |

---

## Environment

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=          # leave blank for mock mode
ANTHROPIC_MODEL=            # optional, defaults to claude-sonnet-4-6
DATABASE_URL=               # optional, defaults to sqlite:///./backend/derby.db
```

---

## Tests

```bash
make test
# 7 tests total:
# test_borda.py           — tie-break order, Borda max bound, blind panel recovery
# test_mock_tournament.py — canonical arc (seed + real text), round fields present
```

All tests run from project root via `venv/bin/python -m pytest backend/tests/ -q`. Do not run from inside `backend/`.

---

## Future phase hooks

`backend/placeholders.py` defines the seams for the betting-market phase:

- `AgentIdentity` — participant (internal or external agent)
- `AgentWallet` — bankroll + ledger
- `MarketBet` — stake on a round outcome at locked odds
- `ExternalAgentEntry` — protocol for an outside agent to enter and bet
- `ReputationScore` — track record that drives future odds/matchmaking

The intended hook: between rounds, `run_tournament()` in `logic.py` opens a betting window, lets `ExternalAgentEntry` participants stake from their `AgentWallet` at posted odds, then settles and updates `ReputationScore`. Nothing is wired yet.

`backend/watchers.py` is a working file-watcher daemon that auto-runs a derby when a `.txt` or `.md` file changes (companion `.goal` file required). It is not wired to the API — run it standalone if needed.
