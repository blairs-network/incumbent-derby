# Incumbent Derby

Incumbent Derby is a local‑first web application that runs a revision tournament
where *doing nothing* is allowed to win.  The goal is to fight the natural
action bias in automated editing: every proposed change must beat the original
text in a blind evaluation before it can be adopted.  Judges rank anonymised
candidates, a Borda count picks a winner, and ties are broken toward less
change.

This repository contains a Python FastAPI backend and a React + Vite frontend.
The backend exposes a simple API to run a tournament, persist the results in
SQLite, and retrieve past derbies.  The frontend provides a single‑page
experience where users can enter their text and revision goal, watch the race
unfold and see whether the original holds.

## Prerequisites

* Python 3.10 or newer
* Node.js 18 LTS or newer (for the frontend)
* (Optional) An Anthropic API key if you wish to run real revisions with the
  Claude API.  Without a key, mock mode will demonstrate the tournament
  behaviour deterministically.

## Setup

Clone this repository and run the following commands from the root of the
project:

```bash
cp .env.example .env
make install
make dev
```

The `install` target sets up the Python virtual environment, installs the
backend dependencies and installs the frontend packages via `npm install`.  The
`dev` target runs both the backend and frontend in development mode using
`uvicorn` and `vite` respectively.  By default the backend serves on
`http://localhost:8000` and the frontend on `http://localhost:5173`.  The
frontend is configured to proxy API requests to the backend during development.

## Environment variables

Copy `.env.example` to `.env` and edit the values as needed.  The following
variables are recognised:

```
ANTHROPIC_API_KEY=sk-...
DATABASE_URL=sqlite:///./derby.db
MOCK_MODE=true
```

When `MOCK_MODE=true` the backend uses a deterministic `MockModel` which
produces predictable winners for demonstration and testing.  When
`MOCK_MODE=false` and an `ANTHROPIC_API_KEY` is provided, the backend will
attempt to call the Anthropic API to generate candidate revisions.

## API

### `POST /derbies`

Create and run a new derby.  The request body must contain at least the
`original_text` and `goal`.  Optional fields control the number of judges,
maximum rounds and other tournament parameters.  Example:

```json
{
  "original_text": "The quick brown fox jumps over the lazy dog.",
  "goal": "reduce redundancies and improve clarity",
  "judges": 5,
  "max_rounds": 5,
  "stop_after": 2,
  "mock_mode": true
}
```

The response contains the derby identifier, the final decision and the full
tournament report.

### `GET /derbies/{id}`

Return the stored results for the derby with the given ID.

### `GET /derbies`

List recent derbies.  The response returns a list of derby summaries sorted by
creation date.

## Tests

Basic tests are located under `backend/tests`.  To run the test suite use
`
pytest backend
`.

## Architecture

The project is deliberately simple to support iterative development.  The
backend contains the core tournament logic derived from the original
`autoreason.py` script.  The `MockModel` provides deterministic outcomes for
testing.  Placeholders are included for future agent‑oriented extensions
(`AgentIdentity`, `AgentWallet`, `MarketBet`, `ExternalAgentEntry`,
`ReputationScore`).  These classes currently do nothing but make clear where
additional behaviour should be implemented later.

Feel free to contribute enhancements such as real wallet integration,
reputation scores or betting markets in future iterations.  For now the
Incumbent Derby demonstrates the core mechanism: a race where the original can
win.

## Automated Derby Triggers (v2)

Version 2 introduces automatic derby triggers.  A small watcher script monitors
a directory for changes to plain text files.  When a file is modified the
system launches a derby automatically using the default goal and tournament
settings configured in your `.env` file.  Results are persisted to the
database just like manual runs.

### Configuring the watcher

In your `.env` file you can set:

```
WATCH_DIR=watched_sources       # directory to watch for text changes
DEFAULT_GOAL=improve clarity without changing meaning
MOCK_MODE=true                  # whether to use the mock model (true/false)
JUDGES=5                        # number of judges for automatic derbies
MAX_ROUNDS=5
STOP_AFTER=2
```

### Running the watcher

With your virtual environment activated, run:

```bash
python -m backend.watchers
```

The script will start watching the configured directory.  Whenever a `.txt` or
`.md` file changes, it reads the contents and runs a derby.  The outcome is
logged to the console and the derby record is stored in the database.

### Custom goals per file

By default the watcher applies the same goal to all files.  You can override
the goal for a specific file by creating a companion file with the suffix
`.goal`.  For example, if you have `policy.txt` and `policy.goal` in the
watch directory, the contents of `policy.goal` will be used as the goal when
`policy.txt` changes.
