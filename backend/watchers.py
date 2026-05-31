"""Directory watcher that automatically triggers derbies when files change.

This script uses the watchdog library to observe a directory for changes to
plain text files.  When a file is modified it reads the content and starts a
new derby using either the mock model or the real Anthropic model depending
on configuration.  Results are persisted to the database.  The goal and
tournament parameters can be customised via environment variables.

Usage:

    poetry run python -m backend.watchers

Environment variables:

* WATCH_DIR — the directory to watch.  Defaults to ``watched_sources``.
* DEFAULT_GOAL — goal applied to all files (e.g. ``improve clarity``).  If not
  set, a simple placeholder goal is used.
* MOCK_MODE — ``true`` or ``false`` (default true).  Determines whether to
  use the mock model.  When false, an Anthropic API key must be available.
* JUDGES, MAX_ROUNDS, STOP_AFTER — optional overrides for tournament parameters.

Only text files (`.txt`, `.md`) are processed.  Other file types are ignored.
Processed files are tracked by their last modification timestamp; if a file
changes again it will trigger another derby.
"""

from __future__ import annotations

import os
import time
from typing import Dict

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent

from dotenv import load_dotenv

from .logic import run_tournament, MockModel, AnthropicModel
from .db import SessionLocal
from .models import Derby


load_dotenv()

WATCH_DIR = os.getenv("WATCH_DIR", "watched_sources")
DEFAULT_GOAL = os.getenv("DEFAULT_GOAL", "improve clarity without changing meaning")
MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() != "false"
JUDGES = int(os.getenv("JUDGES", "5"))
MAX_ROUNDS = int(os.getenv("MAX_ROUNDS", "5"))
STOP_AFTER = int(os.getenv("STOP_AFTER", "2"))


def get_model() -> object:
    if MOCK_MODE:
        return MockModel()
    return AnthropicModel()


class TextFileHandler(FileSystemEventHandler):
    """Handle modifications to text files by triggering a derby."""
    def __init__(self):
        self.last_mtimes: Dict[str, float] = {}
        super().__init__()

    def on_modified(self, event: FileModifiedEvent):
        if event.is_directory:
            return
        path = event.src_path
        ext = os.path.splitext(path)[1].lower()
        if ext not in {".txt", ".md"}:
            return
        # Check modification time to avoid duplicate triggers
        mtime = os.path.getmtime(path)
        if self.last_mtimes.get(path) == mtime:
            return
        self.last_mtimes[path] = mtime
        # Read text
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except Exception as exc:
            print(f"Failed to read {path}: {exc}")
            return
        # Determine goal.  If a companion .goal file exists, use its contents.
        base, _ = os.path.splitext(path)
        goal_file = base + ".goal"
        goal = DEFAULT_GOAL
        if os.path.exists(goal_file):
            try:
                with open(goal_file, encoding="utf-8") as gf:
                    goal = gf.read().strip() or DEFAULT_GOAL
            except Exception as exc:
                print(f"Failed to read goal file {goal_file}: {exc}")
        # Run tournament
        print(f"[watcher] Detected change in {path}, running derby with goal: {goal}")
        model = get_model()
        changed, final_text, rounds, stop_reason = run_tournament(
            model=model,
            goal=goal,
            original=text,
            max_rounds=MAX_ROUNDS,
            n_judges=JUDGES,
            stop_after=STOP_AFTER,
            seed=0,
        )
        final_decision = "CHANGE ADOPTED" if changed else "KEEP ORIGINAL"
        report = {
            "changed": changed,
            "final_text": final_text,
            "rounds": rounds,
            "stop_reason": stop_reason,
        }
        session = SessionLocal()
        derby = Derby(
            original_text=text,
            goal=goal,
            judges=JUDGES,
            max_rounds=MAX_ROUNDS,
            stop_after=STOP_AFTER,
            mock_mode=MOCK_MODE,
            final_decision=final_decision,
            final_text=final_text,
            report_json=__import__("json").dumps(report),
        )
        session.add(derby)
        session.commit()
        session.refresh(derby)
        session.close()
        print(f"[watcher] Derby {derby.id} completed. Decision: {final_decision}.")


def run_watcher():
    os.makedirs(WATCH_DIR, exist_ok=True)
    event_handler = TextFileHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIR, recursive=False)
    observer.start()
    print(f"Watching directory '{WATCH_DIR}' for text file changes...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    run_watcher()