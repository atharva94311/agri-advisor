"""Text-to-speech (advice text -> audio in the farmer's language) with Sarvam AI (bulbul)."""
from __future__ import annotations

import base64
from abc import ABC, abstractmethod

import requests

from .. import config
from . import sarvam

MAX_CHARS = 1500  # bulbul:v3 allows 2500; chat replies are a few sentences


class TextToSpeech(ABC):
    @abstractmethod
    def synthesize(self, text: str, language: str) -> tuple[bytes, str]:
        """Returns (audio_bytes, mime_type), e.g. (b'...', 'audio/mpeg')."""


class SarvamTTS(TextToSpeech):
    def synthesize(self, text, language):
        body = {"text": text[:MAX_CHARS], "language_code": sarvam.TO_SARVAM.get(language, "en-IN"),
                "model": config.SARVAM_TTS_MODEL, "output_audio_codec": "mp3"}
        if config.SARVAM_TTS_SPEAKER:
            body["speaker"] = config.SARVAM_TTS_SPEAKER
        r = requests.post(f"{config.SARVAM_BASE_URL}/text-to-speech", headers=sarvam.headers(), json=body,
                          timeout=config.HTTP_TIMEOUT)
        sarvam.raise_for_error(r, "text-to-speech")
        return base64.b64decode(r.json()["audios"][0]), "audio/mpeg"


def get_tts() -> TextToSpeech:
    return SarvamTTS()
