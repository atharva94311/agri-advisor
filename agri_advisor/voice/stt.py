"""Speech-to-text (farmer's voice -> text) with Sarvam AI (saaras), auto-detecting the Indian language."""
from __future__ import annotations

from abc import ABC, abstractmethod

import requests

from .. import config
from . import sarvam


class SpeechToText(ABC):
    @abstractmethod
    def transcribe(self, audio: bytes, language: str | None = None, filename: str = "audio.webm",
                   mime: str = "audio/webm") -> tuple[str, str]:
        """audio: raw audio file bytes (wav/mp3/ogg/webm as uploaded). language: app code hint or None to auto-detect.
        Returns (transcript, detected_language_code)."""


def sarvam_content_type(mime: str) -> str:
    """Browsers send e.g. "audio/webm;codecs=opus"; Sarvam only accepts the bare type. Unknown containers
    (e.g. Safari's audio/mp4) go as application/octet-stream, which Sarvam accepts and sniffs."""
    base = (mime or "").split(";")[0].strip().lower()
    known = {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
             "audio/aac", "audio/x-aac", "audio/aiff", "audio/flac"}
    return base if base in known else "application/octet-stream"


class SarvamSTT(SpeechToText):
    def transcribe(self, audio, language=None, filename="audio.webm", mime="audio/webm"):
        r = requests.post(
            f"{config.SARVAM_BASE_URL}/speech-to-text",
            headers=sarvam.headers(),
            files={"file": (filename, audio, sarvam_content_type(mime))},
            data={"model": config.SARVAM_STT_MODEL, "language_code": sarvam.TO_SARVAM.get(language or "", "unknown")},
            timeout=config.HTTP_TIMEOUT,
        )
        sarvam.raise_for_error(r, "speech-to-text")
        js = r.json()
        detected = sarvam.FROM_SARVAM.get(js.get("language_code") or "", language or "en")
        return js.get("transcript", "").strip(), detected


def get_stt() -> SpeechToText:
    return SarvamSTT()
