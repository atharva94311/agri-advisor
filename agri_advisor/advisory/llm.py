"""Chat LLM via OpenRouter (OpenAI-compatible chat completions API).

Set in .env: LLM_PROVIDER=openrouter, LLM_API_KEY, and optionally LLM_MODEL (default openai/gpt-4o).
While LLM_PROVIDER is empty, chat.py falls back to a deterministic English template reply.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import requests

from .. import config


class LLMClient(ABC):
    @abstractmethod
    def complete(self, system: str, messages: list[dict]) -> str:
        """system: full system prompt (contains the fact sheet).
        messages: [{"role": "user" | "assistant", "content": str}, ...] oldest first; last is the farmer's message.
        Returns the assistant reply text."""


class OpenRouterLLM(LLMClient):
    def __init__(self):
        if not config.LLM_API_KEY:
            raise RuntimeError("LLM_API_KEY is not set in .env")
        self.model = config.LLM_MODEL

    def complete(self, system, messages):
        r = requests.post(
            f"{config.LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {config.LLM_API_KEY}", "Content-Type": "application/json",
                     "X-Title": "Agri Advisory Assistant"},
            json={"model": self.model, "messages": [{"role": "system", "content": system}] + messages,
                  "temperature": 0.3, "max_tokens": 400},
            timeout=config.HTTP_TIMEOUT,
        )
        if r.status_code != 200:
            raise RuntimeError(f"OpenRouter error {r.status_code}: {r.text[:300]}")
        return r.json()["choices"][0]["message"]["content"].strip()


def get_llm() -> LLMClient | None:
    if not config.LLM_PROVIDER:
        return None
    if config.LLM_PROVIDER.lower() == "openrouter":
        return OpenRouterLLM()
    raise ValueError(f"Unsupported LLM_PROVIDER '{config.LLM_PROVIDER}' (supported: openrouter)")
