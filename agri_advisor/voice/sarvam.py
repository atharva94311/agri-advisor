"""Sarvam AI REST helpers shared by speech-to-text and text-to-speech."""
from __future__ import annotations

from .. import config

# App language codes (config.SUPPORTED_LANGUAGES) <-> Sarvam BCP-47 codes
TO_SARVAM = {"en": "en-IN", "hi": "hi-IN", "mr": "mr-IN", "bn": "bn-IN", "te": "te-IN", "ta": "ta-IN",
             "gu": "gu-IN", "kn": "kn-IN", "ml": "ml-IN", "pa": "pa-IN", "or": "od-IN"}
FROM_SARVAM = {v: k for k, v in TO_SARVAM.items()}


def headers() -> dict:
    if not config.SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is not set in .env")
    return {"api-subscription-key": config.SARVAM_API_KEY}


def raise_for_error(r, what: str) -> None:
    if r.status_code != 200:
        raise RuntimeError(f"Sarvam {what} error {r.status_code}: {r.text[:300]}")
