"""Settings. Each value can be overridden with an environment variable or in .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _path(env: str, default: Path) -> Path:
    return Path(os.getenv(env, str(default)))


# --- Paths -----------------------------------------------------------------------------------
RAW_DIR = _path("AGRI_RAW_DIR", ROOT / "data" / "raw")
PROCESSED_DIR = _path("AGRI_PROCESSED_DIR", ROOT / "data" / "processed")
DATASET_PATH = _path("AGRI_DATASET_PATH", PROCESSED_DIR / "hybrid_harvest_dataset.csv")
RAINFALL_NORMALS_PATH = PROCESSED_DIR / "district_rainfall_normals.csv"
BASE_YIELD_PATH = PROCESSED_DIR / "base_yield_by_state.csv"

MODEL_PATH = _path("AGRI_MODEL_PATH", ROOT / "models" / "harvest_model.joblib")

# Raw data collected from the APIs.
DATA_DB_PATH = _path("AGRI_DATA_DB", ROOT / "db" / "agri_data.db")
# Model outputs and chat history.
PREDICTIONS_DB_PATH = _path("AGRI_PREDICTIONS_DB", ROOT / "db" / "predictions.db")

# --- Inference --------------------------------------------------------------------------------
FORECAST_DAYS = int(os.getenv("AGRI_FORECAST_DAYS", "16"))
CURVE_HORIZON_DAYS = int(os.getenv("AGRI_CURVE_HORIZON_DAYS", "90"))
READY_THRESHOLD = float(os.getenv("AGRI_READY_THRESHOLD", "0.8"))

# --- External data APIs ----------------------------------------------------------------------
# Weather + soil moisture: Open-Meteo (free, no key)
OPEN_METEO_FORECAST_URL = os.getenv("OPEN_METEO_FORECAST_URL", "https://api.open-meteo.com/v1/forecast")
OPEN_METEO_ARCHIVE_URL = os.getenv("OPEN_METEO_ARCHIVE_URL", "https://archive-api.open-meteo.com/v1/archive")
# Soil properties: ISRIC SoilGrids (free, no key). REST first, WCS map service as fallback.
SOILGRIDS_REST_URL = os.getenv("SOILGRIDS_REST_URL", "https://rest.isric.org/soilgrids/v2.0")
SOILGRIDS_WCS_URL = os.getenv("SOILGRIDS_WCS_URL", "https://maps.isric.org/mapserv")
# Mandi prices: data.gov.in / Agmarknet "Current daily price of various commodities" (free key required)
MANDI_API_URL = os.getenv("MANDI_API_URL", "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070")
MANDI_API_KEY = os.getenv("MANDI_API_KEY", "")
# Reverse geocoding (lat/lon -> state, district): OpenStreetMap Nominatim (free, no key, max 1 request/second)
NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org/reverse")
# Nominatim's usage policy asks for an identifying User-Agent; add a contact email in .env
CONTACT_EMAIL = os.getenv("AGRI_CONTACT_EMAIL", "")
HTTP_USER_AGENT = f"agri-advisor/0.1{f' ({CONTACT_EMAIL})' if CONTACT_EMAIL else ''}"
HTTP_TIMEOUT = float(os.getenv("AGRI_HTTP_TIMEOUT", "60"))

# Chat LLM: OpenRouter (OpenAI-compatible chat completions). Empty LLM_PROVIDER = English template replies.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "")
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4o")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")

# Speech-to-text + text-to-speech: Sarvam AI (Indian languages)
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai")
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v4")
SARVAM_TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
SARVAM_TTS_SPEAKER = os.getenv("SARVAM_TTS_SPEAKER", "")  # empty = the model's default voice

SUPPORTED_LANGUAGES = {
    "en": "English", "hi": "Hindi", "mr": "Marathi", "bn": "Bengali", "te": "Telugu",
    "ta": "Tamil", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi", "or": "Odia",
}


def ensure_dirs() -> None:
    for p in (RAW_DIR, PROCESSED_DIR, MODEL_PATH.parent, DATA_DB_PATH.parent, PREDICTIONS_DB_PATH.parent):
        p.mkdir(parents=True, exist_ok=True)
