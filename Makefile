# Incumbent Derby
# ──────────────
# Quickstart:
#   cp .env.example .env
#   make install
#   make dev
# Then open http://localhost:5173

PYTHON   := python3
VENV     := venv
VENV_BIN := $(VENV)/bin

.PHONY: install dev backend frontend test clean

install:
	$(PYTHON) -m venv $(VENV)
	$(VENV_BIN)/pip install --upgrade pip -q
	$(VENV_BIN)/pip install -r backend/requirements.txt
	cd frontend && npm install

# Run backend + frontend together. Ctrl-C kills both.
dev:
	@echo "backend  -> http://localhost:8000"
	@echo "frontend -> http://localhost:5173"
	@trap 'kill 0' INT TERM EXIT; \
	  ( set -a; [ -f .env ] && . ./.env; set +a; \
	    $(VENV_BIN)/uvicorn backend.main:app --reload --port 8000 ) & \
	  ( cd frontend && npm run dev ) & \
	  wait

backend:
	@set -a; [ -f .env ] && . ./.env; set +a; \
	  $(VENV_BIN)/uvicorn backend.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	$(VENV_BIN)/python -m pytest backend/tests/ -q

clean:
	rm -rf $(VENV) frontend/node_modules frontend/dist backend/derby.db
