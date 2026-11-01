"""Voice agent: farmer audio -> STT -> chat (LLM over predictions) -> TTS -> audio reply.

For phone calls, a telephony webhook can call `handle_voice_turn` once per utterance and play back the
returned audio.
"""
from __future__ import annotations

from ..advisory.chat import chat
from .stt import get_stt
from .tts import get_tts


def handle_voice_turn(farm_id: str, audio: bytes, session_id: str | None = None, language: str | None = None,
                      filename: str = "audio.webm", mime: str = "audio/webm") -> dict:
    text, detected = get_stt().transcribe(audio, language, filename=filename, mime=mime)
    if not text:
        raise ValueError("No speech was recognised in the audio.")
    language = language or detected
    result = chat(farm_id, text, session_id=session_id, language=language)
    audio_out, mime = get_tts().synthesize(result["reply"], result["language"])
    return {**result, "transcript": text, "audio": audio_out, "mime_type": mime}
