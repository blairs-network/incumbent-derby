"""Model backends for Incumbent Derby.

Any object with .complete(system, prompt, temperature) -> str is a valid backend.
Agents bring their own key and model spec; the arena provides the rules.
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

import httpx


class AnthropicModel:
    def __init__(self, model: Optional[str] = None, max_tokens: int = 2000):
        self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        self.max_tokens = max_tokens
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        base = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        self.url = base.rstrip("/") + "/v1/messages"

    def complete(self, system: str, prompt: str, temperature: float = 1.0) -> str:
        # System prompt cached — judge calls share the same lens header, saving ~90% on input tokens.
        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": temperature,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": prompt}],
        }
        auth = (
            {"Authorization": f"Bearer {self.api_key}"}
            if self.api_key.startswith("sk-ant-si-")
            else {"x-api-key": self.api_key}
        )
        r = httpx.post(self.url, json=payload, headers={
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
            **auth,
        }, timeout=120)
        r.raise_for_status()
        return "".join(
            b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text"
        ).strip()


class OpenAICompatibleModel:
    """Handles any OpenAI-compatible endpoint: OpenAI, Groq, Cerebras, Together, etc."""
    def __init__(self, model: str, api_key: str, base_url: str, max_tokens: int = 2000):
        self.model = model
        self.max_tokens = max_tokens
        self.api_key = api_key
        self.url = base_url.rstrip("/") + "/v1/chat/completions"

    def complete(self, system: str, prompt: str, temperature: float = 1.0) -> str:
        r = httpx.post(self.url, json={
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": temperature,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        }, headers={
            "content-type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }, timeout=120)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


def OpenAIModel(model: Optional[str] = None, max_tokens: int = 2000):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY not set")
    base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
    return OpenAICompatibleModel(model or "gpt-4o", key, base, max_tokens)


def GroqModel(model: Optional[str] = None, max_tokens: int = 2000):
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise ValueError("GROQ_API_KEY not set — get a free key at console.groq.com")
    return OpenAICompatibleModel(
        model or "llama-3.3-70b-versatile",
        key,
        "https://api.groq.com/openai",
        max_tokens,
    )


class MockModel:
    """Deterministic, no network. Canonical arc: AB wins R1, incumbent holds R2+R3, stops."""

    Q_RE = re.compile(r"\[\[Q=(-?\d+)\]\]")

    def complete(self, system: str, prompt: str, temperature: float = 1.0) -> str:
        m = re.search(r"STRATEGY=(\w+)", system)
        if m:
            strategy = m.group(1)
            q = self._incumbent_q(prompt)
            mapping = {"A": 5, "B": 7, "AB": 8} if q <= 5 else {"A": 6, "B": 7, "AB": 4}
            return f"[[Q={mapping.get(strategy, q)}]] {strategy} revision"
        return self._judge(prompt)

    def _read_q(self, text: str, default: int = 5) -> int:
        m = self.Q_RE.search(text)
        return int(m.group(1)) if m else default

    def _incumbent_q(self, prompt: str) -> int:
        m = re.search(r"ORIGINAL:\n(.*?)(?:\n\nCANDIDATE|\Z)", prompt, re.S)
        return self._read_q(m.group(1) if m else prompt)

    def _judge(self, prompt: str) -> str:
        options = re.findall(r"### Option (\d+)\n(.*?)(?=\n### Option |\Z)", prompt, re.S)
        scores = [(int(oid), self._read_q(text)) for oid, text in options]
        return json.dumps({"ranking": [oid for oid, _ in sorted(scores, key=lambda t: (-t[1], t[0]))], "reason": "mock"})


def resolve_model(spec: str, mock: bool = False):
    """Parse provider/model-id into a model instance.

    Supported providers: anthropic, openai, groq, mock.
    Custom OpenAI-compatible endpoints: set OPENAI_BASE_URL env var.
    """
    if mock or not spec or spec == "mock":
        return MockModel()
    provider, _, model_id = spec.partition("/")
    if provider == "anthropic":
        return AnthropicModel(model=model_id or None)
    if provider == "openai":
        return OpenAIModel(model=model_id or None)
    if provider == "groq":
        return GroqModel(model=model_id or None)
    raise ValueError(f"Unknown provider: {provider!r}. Supported: anthropic, openai, groq, mock")
