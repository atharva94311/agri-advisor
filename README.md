# Multilingual Agritech & Resource Advisory Assistant

Ingests soil, weather, crop and mandi data, forecasts **harvest readiness over time** with an ML model, and
turns the result into plain-language advice in the farmer's language, by chat or by voice.

## Architecture

```
 Soil API ─┐
 Crop info ┼─► collector ─► agri_data.db ─► features ─► ML model ─► readiness curve ─► predictions.db
 Weather  ─┤   (ingestion/)  (storage.py)   (agronomy.py) (ml/)       + rules (alerts,      │
 Mandi    ─┘                                                          market, calendar)    │
                                                                                            ▼
                         farmer ◄── TTS ◄── LLM (system prompt + fact sheet) ◄── chat service (advisory/)
                         farmer ──► STT ──────────────────────────────────────► voice agent (voice/)
```

| Component | Code |
|---|---|
| Data ingestion | `agri_advisor/ingestion/`: `open_meteo.py` (weather, soil moisture), `soilgrids.py` (soil), `mandi_datagov.py` (prices), `geocode.py` (state/district), `soil_compat.py` (unit conversion to training scale), `collector.py` |
| Collected data | `db/agri_data.db` via `agri_advisor/storage.py` |
| Harvest model | `agri_advisor/ml/model.py` (gradient-boosted trees), `train.py`, `inference.py` |
| Readiness curve | `prediction["curve"]`: daily readiness / health / maturity for the next 90 days |
| Predictions + chat history | `db/predictions.db` |
| Chat | `agri_advisor/advisory/` (`prompts.py`, `chat.py`, `llm.py` → OpenRouter) |
| Voice | `agri_advisor/voice/` (`stt.py`, `tts.py` → Sarvam AI, `agent.py`) |
| Web app | `frontend/` (see [frontend/README.md](frontend/README.md)) |

Every number is computed by the model and by `advisory/rules.py`. The LLM gets a compact **fact sheet** and only
explains those facts.

## Data sources

| Data | Source | Key |
|---|---|---|
| Weather history + 16-day forecast, soil moisture | Open-Meteo | none |
| Soil N, pH, texture, soil type | ISRIC SoilGrids | none |
| State / district from GPS | OpenStreetMap Nominatim | none |
| Mandi prices | data.gov.in (Agmarknet) | `MANDI_API_KEY` |
| Chat replies (11 languages) | OpenRouter | `LLM_API_KEY` |
| Speech-to-text / text-to-speech | Sarvam AI | `SARVAM_API_KEY` |

If an API can't supply a required value, that farm's forecast fails with an error. Weather beyond the 16-day
forecast uses district rainfall normals, and each curve point is labelled `forecast` or `climate_normal`.

## Setup

The trained model (`models/harvest_model.joblib`, scikit-learn 1.9) is checked in, so the three data/training
steps are optional. Run them to rebuild from scratch, or if the model fails to load on your scikit-learn version.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # add MANDI_API_KEY, LLM_API_KEY, SARVAM_API_KEY
python main.py download-data      # optional: Kaggle datasets -> data/raw
python main.py build-dataset      # optional: -> data/processed/hybrid_harvest_dataset.csv
python main.py train              # optional: -> models/harvest_model.joblib
python main.py add-farm --id F1 --lat 30.85 --lon 75.75 --crop wheat --sown 2026-10-28 --irrigated --language pa
python main.py predict            # fetch data, run the model, store predictions
python main.py chat --farm F1
python main.py serve              # API at http://127.0.0.1:8000/docs
cd frontend && npm install && npm run dev   # web app at http://localhost:5173 (in a second terminal)
```

### Docker

```bash
docker build -t agri-advisor .
docker run -p 8000:8000 --env-file .env -v "$PWD/db:/app/db" agri-advisor   # web app + API at http://localhost:8000
```

To host it, click [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/atharva94311/agri-advisor)
and paste your keys when asked ([render.yaml](render.yaml), free plan: sleeps when idle and starts with empty
databases after each restart).

The image holds the code, the model weights and the rainfall lookup table, not the training data. It serves the
API under `/api` and the web app on `/` (`agri_advisor/api/web.py`).

Run `python main.py predict` daily (cron / launchd) to refresh forecasts. Mandi price trends build up from these
daily runs, since the data.gov.in resource only holds the latest day.

## Training dataset

`data/processed/hybrid_harvest_dataset.csv` has 162,583 rows from 5,469 simulated field-seasons across 14 crops
(rice, maize, wheat, cotton, chickpea, lentil, pigeonpeas, mungbean, blackgram, mothbeans, kidneybeans, jute,
watermelon, muskmelon). Each row is one observation day within a season.

| Kaggle source | Used for |
|---|---|
| `atharvaingle/crop-recommendation-dataset` | soil N/pH and season temperature/humidity per crop |
| `gdabhishek/fertilizer-prediction` | soil type and starting soil moisture per crop |
| `abhinand05/crop-production-in-india` | where each crop is grown (state/district, area-weighted) and state base yield |
| `rajanand/rainfall-in-india` | district monthly rainfall normals, used to simulate daily rain |

No public dataset links these sources together or records harvest outcomes. The builder samples a real
location, soil and climate profile, simulates daily weather, and tracks crop development with growing degree
days. Targets come from the agronomic rules in `agronomy.py`:

| Target | Meaning |
|---|---|
| `days_to_harvest` | days from this observation to the optimal harvest day (negative = overdue) |
| `harvest_readiness` | 0–1, combining maturity and rain at harvest |
| `crop_health_index` | 0–1, from heat, cold, water, waterlogging, disease and nutrient stress |
| `maturity_pct` | % of the required growing degree days accumulated |
| `expected_yield_kg_ha` | state base yield × season health |

Model inputs are the 26 numeric and 3 categorical features in `agronomy.NUMERIC_FEATURES` / `CATEGORICAL_FEATURES`,
one-hot encoded to 48 columns. The train/test split is by `season_id`, so the test set holds unseen seasons.
The columns `season_id, state, district, sowing_date, obs_date, optimal_harvest_date, rain_source,
soil_climate_source` are metadata, not model inputs.

`data/processed/` also holds `district_rainfall_normals.csv` (used at inference for weather beyond the forecast)
and `base_yield_by_state.csv` (training only).

## Limitations

- Training labels are simulated from agronomic rules, not observed harvests. Real outcomes recorded through
  `POST /farms/{id}/harvest-outcome` can be used to retrain.
- Crop durations in `crops.py` are typical values, so long-duration local varieties may be flagged overdue early.
- Agmarknet has no listing for kidney beans or moth beans. If a farm's state has no trades that day, no price is
  shown; prices from other states are not used.
- SoilGrids sometimes returns HTTP 503. Requests are retried, and each farm's soil is cached for 6 months.
