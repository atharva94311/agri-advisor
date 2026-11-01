"""HTTP API (FastAPI). Run: python main.py serve   ->   http://127.0.0.1:8000/docs"""
from __future__ import annotations

import base64

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import config, storage
from ..advisory.chat import chat
from ..crops import CROPS
from ..ingestion.collector import collect_for_farm
from ..ingestion.farms import register_farm as register
from ..ml.inference import run_inference
from ..voice.agent import handle_voice_turn
from ..voice.tts import get_tts

app = FastAPI(title="Agri Advisory Assistant", version="0.1.0")


class FarmIn(BaseModel):
    farm_id: str
    farmer_name: str | None = None
    phone: str | None = None
    language: str = "en"
    latitude: float
    longitude: float
    state: str | None = None
    district: str | None = None
    crop: str
    sowing_date: str  # YYYY-MM-DD
    irrigated: bool = False
    area_ha: float | None = None
    soil_type: str | None = None  # Black | Clayey | Loamy | Red | Sandy (auto-detected from SoilGrids if empty)
    variety: str | None = None
    # Optional Soil Health Card values (override the SoilGrids values)
    soil_n: float | None = None
    soil_ph: float | None = None


class ChatIn(BaseModel):
    farm_id: str
    message: str
    session_id: str | None = None
    language: str | None = None


class TtsIn(BaseModel):
    text: str
    language: str = "en"


class HarvestOutcomeIn(BaseModel):
    harvest_date: str
    yield_kg_ha: float | None = None
    notes: str = ""


def _farm_or_404(farm_id: str) -> dict:
    farm = storage.get_farm(farm_id)
    if not farm:
        raise HTTPException(404, f"Unknown farm_id '{farm_id}'")
    return farm


@app.get("/health")
def health():
    return {"status": "ok", "model_present": config.MODEL_PATH.exists(), "mandi_key_set": bool(config.MANDI_API_KEY),
            "llm_configured": bool(config.LLM_PROVIDER and config.LLM_API_KEY),
            "voice_configured": bool(config.SARVAM_API_KEY), "crops": list(CROPS)}


@app.post("/farms")
def register_farm(farm: FarmIn):
    try:
        return register(farm.model_dump())
    except (KeyError, ValueError) as e:
        raise HTTPException(400, str(e))


@app.get("/farms")
def farms():
    return storage.list_farms()


@app.get("/farms/{farm_id}")
def farm(farm_id: str):
    return _farm_or_404(farm_id)


@app.post("/farms/{farm_id}/collect")
def collect(farm_id: str):
    _farm_or_404(farm_id)
    return collect_for_farm(farm_id)


@app.post("/farms/{farm_id}/predict")
def predict(farm_id: str, collect: bool = True):
    _farm_or_404(farm_id)
    try:
        return run_inference(farm_id, collect=collect)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(409, str(e))


@app.get("/farms/{farm_id}/prediction")
def latest_prediction(farm_id: str):
    p = storage.latest_prediction(farm_id)
    if not p:
        raise HTTPException(404, "No prediction yet. POST /farms/{farm_id}/predict first.")
    return p


@app.post("/farms/{farm_id}/harvest-outcome")
def harvest_outcome(farm_id: str, body: HarvestOutcomeIn):
    _farm_or_404(farm_id)
    storage.record_harvest_outcome(farm_id, body.harvest_date, body.yield_kg_ha, body.notes)
    return {"saved": True}


@app.post("/chat")
def chat_endpoint(body: ChatIn):
    _farm_or_404(body.farm_id)
    try:
        return chat(body.farm_id, body.message, body.session_id, body.language)
    except RuntimeError as e:  # LLM provider error
        raise HTTPException(502, str(e))


@app.post("/voice")
async def voice_endpoint(farm_id: str = Form(...), audio: UploadFile = File(...),
                         session_id: str | None = Form(None), language: str | None = Form(None)):
    _farm_or_404(farm_id)
    try:
        result = handle_voice_turn(farm_id, await audio.read(), session_id, language,
                                   filename=audio.filename or "audio.webm", mime=audio.content_type or "audio/webm")
    except ValueError as e:  # nothing recognised
        raise HTTPException(422, str(e))
    except RuntimeError as e:  # Sarvam / LLM provider error
        raise HTTPException(502, str(e))
    result["audio_base64"] = base64.b64encode(result.pop("audio")).decode()
    return result


@app.post("/tts")
def tts_endpoint(body: TtsIn):
    """Speak any text (e.g. an earlier reply) in the given language with Sarvam text-to-speech."""
    if not body.text.strip():
        raise HTTPException(422, "text is empty")
    try:
        audio, mime = get_tts().synthesize(body.text, body.language)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return {"audio_base64": base64.b64encode(audio).decode(), "mime_type": mime}
