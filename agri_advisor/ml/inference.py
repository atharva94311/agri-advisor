"""Live inference: data DB -> features -> trained model -> readiness curve over time -> predictions DB."""
from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .. import config, storage
from ..advisory import rules
from ..agronomy import (TARGETS, WEATHER_COLS, climatology_extension, daily_state, feature_rows,
                        static_features, to_model_matrix)
from ..crops import CropProfile, get_crop
from ..ingestion.collector import collect_for_farm

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
# Current state names (OpenStreetMap) -> names used in the rainfall normals file (older administrative names)
STATE_ALIASES = {"ODISHA": "ORISSA", "UTTARAKHAND": "UTTARANCHAL", "CHHATTISGARH": "CHATISGARH",
                 "HIMACHALPRADESH": "HIMACHAL", "PUDUCHERRY": "PONDICHERRY", "TELANGANA": "ANDHRA PRADESH",
                 "LADAKH": "JAMMU AND KASHMIR", "DADRAANDNAGARHAVELIANDDAMANANDDIU": "DADAR NAGAR HAVELI",
                 "NATIONALCAPITALTERRITORYOFDELHI": "DELHI"}


class HarvestModel:
    def __init__(self, path: Path | None = None):
        path = Path(path or config.MODEL_PATH)
        if not path.exists():
            raise FileNotFoundError(f"No trained model at {path}. Run: python main.py train")
        bundle = joblib.load(path)
        self.model, self.columns = bundle["model"], bundle["model_columns"]
        # Trained with n_jobs=-1. Predicting a 90-day curve is fast in one process, and parallel predict would
        # start a worker process per CPU, each holding a copy of the trees (~500 MB extra per request).
        if hasattr(self.model, "n_jobs"):
            self.model.n_jobs = 1
        self.version = bundle.get("version", "unknown")
        self.feature_ranges = bundle.get("feature_ranges", {})

    def range_warnings(self, row: pd.Series) -> list[str]:
        """Live features outside the training data's 1st-99th percentile (predictions there are less reliable)."""
        out = []
        for col, (lo, hi) in self.feature_ranges.items():
            v = row.get(col)
            if v is not None and not (lo - 1e-9 <= v <= hi + 1e-9):
                out.append(f"{col}={v:.2f} outside training range [{lo:.2f}, {hi:.2f}]")
        return out

    def predict(self, raw_features: pd.DataFrame) -> pd.DataFrame:
        X = to_model_matrix(raw_features)[self.columns]
        out = pd.DataFrame(np.asarray(self.model.predict(X)), columns=TARGETS, index=raw_features.index)
        out["harvest_readiness"] = out["harvest_readiness"].clip(0, 1)
        out["crop_health_index"] = out["crop_health_index"].clip(0, 1)
        out["maturity_pct"] = out["maturity_pct"].clip(0, 150)
        out["expected_yield_kg_ha"] = out["expected_yield_kg_ha"].clip(lower=0)
        return out


@lru_cache(maxsize=1)
def _load_model(path: str) -> HarvestModel:
    return HarvestModel(Path(path))


@lru_cache(maxsize=1)
def _rain_normals() -> pd.DataFrame | None:
    p = config.RAINFALL_NORMALS_PATH
    return pd.read_csv(p) if p.exists() else None


def monthly_rain_for(state: str | None, district: str | None) -> tuple[np.ndarray, float]:
    from ..dataset.build_hybrid import norm_key
    rn = _rain_normals()
    if rn is None:
        raise FileNotFoundError("data/processed/district_rainfall_normals.csv missing. Run: python main.py build-dataset")
    for col, val in (("district", district), ("state", STATE_ALIASES.get(norm_key(state or ""), state))):
        if val:
            hit = rn[rn[col].map(norm_key) == norm_key(val)]
            if not hit.empty:
                m = hit[MONTHS].mean().to_numpy(dtype=float)
                return m, float(m.sum())
    raise ValueError(f"No rainfall normals for state={state!r}, district={district!r}. "
                     f"Add the state to STATE_ALIASES in ml/inference.py.")


def build_weather_frame(farm: dict, today: date, horizon: int, monthly_rain: np.ndarray) -> pd.DataFrame:
    """Observed weather (sowing..yesterday) + forecast (today..) + climatology up to today + horizon."""
    sowing = pd.Timestamp(farm["sowing_date"])
    stored = storage.get_weather(farm["farm_id"], start=sowing.date().isoformat())
    if stored.empty:
        raise ValueError(f"No weather stored for farm {farm['farm_id']}. Run the collector first.")
    w = stored[WEATHER_COLS].set_index("date").sort_index()
    w = w.reindex(pd.date_range(sowing, w.index.max(), freq="D"))
    gaps = int(w.isna().any(axis=1).sum())
    if gaps:
        raise ValueError(f"Weather history has {gaps} missing days out of {len(w)}; re-run the collector.")
    w = w.reset_index(names="date")

    end = pd.Timestamp(today) + pd.Timedelta(days=horizon + 7)  # +7 so forward-looking features are filled
    ext = climatology_extension(w, w["date"].max() + pd.Timedelta(days=1), (end - w["date"].max()).days, monthly_rain)
    return pd.concat([w, ext], ignore_index=True) if len(ext) else w


def summarise_curve(curve: pd.DataFrame, today: date, dth_now: float) -> dict:
    """Pick the harvest date/window from the readiness curve, cross-checked with the model's direct
    days-to-harvest estimate (the curve alone is unreliable far past maturity, where training data ends)."""
    today_ts = pd.Timestamp(today)
    model_opt = today_ts + pd.Timedelta(days=round(dth_now))
    best = int(curve["harvest_readiness"].to_numpy().argmax())
    peak = float(curve["harvest_readiness"].iloc[best])
    day = pd.Timedelta(days=1)

    if dth_now < -3 and (best == 0 or peak < 0.3):
        # optimum already passed: the curve only decays from today
        rec, window = today_ts, (model_opt - 3 * day, model_opt + 3 * day)
    elif peak >= 0.3 and abs((curve["date"].iloc[best] - model_opt).days) <= 21:
        rec = curve["date"].iloc[best]
        ready = curve["harvest_readiness"] >= config.READY_THRESHOLD
        if peak >= config.READY_THRESHOLD:
            lo = hi = best  # contiguous ready block containing the peak
            while lo > 0 and ready.iloc[lo - 1]:
                lo -= 1
            while hi < len(curve) - 1 and ready.iloc[hi + 1]:
                hi += 1
            window = (curve["date"].iloc[lo], curve["date"].iloc[hi])
        else:
            window = (rec - 2 * day, rec + 2 * day)
    else:
        rec = max(today_ts, model_opt)
        window = (rec - 3 * day, rec + 3 * day)

    if today_ts > window[1]:
        status = "overdue"
    elif today_ts >= window[0]:
        status = "ready"
    elif today_ts >= window[0] - 7 * day:
        status = "approaching"
    else:
        status = "growing"
    return {"recommended_harvest_date": rec.date().isoformat(), "window_start": window[0].date().isoformat(),
            "window_end": window[1].date().isoformat(), "peak_readiness": round(peak, 3), "harvest_status": status}


def run_inference(farm_id: str, collect: bool = True, today: date | None = None, model_path: Path | None = None) -> dict:
    today = today or date.today()
    if collect:
        report = collect_for_farm(farm_id, today=today)
        if report["errors"]:
            print(f"[collector] {report['errors']}")

    farm = storage.get_farm(farm_id)
    if not farm:
        raise KeyError(f"Unknown farm_id '{farm_id}'")
    crop: CropProfile = get_crop(farm["crop"])
    sowing = date.fromisoformat(farm["sowing_date"])
    if today < sowing:
        raise ValueError(f"Farm {farm_id} is not sown yet (sowing date {sowing}).")

    soil = storage.latest_soil(farm_id)
    if not soil:
        raise ValueError(f"No soil reading for farm {farm_id}. Run the collector first.")
    soil_type = farm.get("soil_type") or soil.get("soil_type")
    # The soil-water model starts at sowing, so it starts from the measured moisture on the sowing date.
    initial_moisture = soil.get("moisture_at_sowing")
    if soil_type is None or initial_moisture is None or soil.get("N") is None or soil.get("ph") is None:
        raise ValueError(f"Incomplete soil data for farm {farm_id}: {soil}. Re-run the collector.")
    monthly_rain, annual_rain = monthly_rain_for(farm.get("state"), farm.get("district"))

    horizon = config.CURVE_HORIZON_DAYS
    w = build_weather_frame(farm, today, horizon, monthly_rain)
    stored = storage.get_weather(farm_id, start=sowing.isoformat())
    fc_dates = set(stored.loc[stored["is_forecast"] == 1, "date"])
    last_known = stored["date"].max()
    st = daily_state(w, crop, soil_type, bool(farm.get("irrigated")), initial_moisture)
    static = static_features(crop, soil, soil_type, bool(farm.get("irrigated")), pd.Timestamp(sowing), annual_rain)
    rows = feature_rows(st, static)

    today_idx = (today - sowing).days
    curve_rows = rows.iloc[today_idx: today_idx + horizon + 1]
    model = _load_model(str(model_path or config.MODEL_PATH))
    pred = model.predict(curve_rows)

    curve = pd.DataFrame({
        "date": st["date"].iloc[today_idx: today_idx + horizon + 1].to_numpy(),
        "harvest_readiness": pred["harvest_readiness"].to_numpy(),
        "crop_health_index": pred["crop_health_index"].to_numpy(),
        "maturity_pct": pred["maturity_pct"].to_numpy(),
    })
    now = pred.iloc[0]
    warnings = model.range_warnings(curve_rows.iloc[0])
    if warnings:
        print(f"[inference] {farm_id}: " + "; ".join(warnings))
    summary = summarise_curve(curve, today, float(now["days_to_harvest"]))

    next7 = st.iloc[today_idx: today_idx + 7]
    alerts = rules.weather_alerts(crop, next7, float(st["soil_moisture"].iloc[today_idx]),
                                  float(now["maturity_pct"]), float(now["harvest_readiness"]))
    alerts += rules.harvest_alerts(crop, summary, today)
    market = rules.market_summary(crop, farm.get("state"), storage.recent_mandi(crop.name, farm.get("state")))

    farm_ctx = {**farm, "crop_info": storage.latest_crop_info(farm_id), "days_since_sowing": today_idx,
                "soil": {k: soil.get(k) for k in ("N", "ph", "moisture", "soil_type")},
                "data_warnings": warnings,
                "crop_calendar": rules.crop_calendar(crop, today),
                "weather_next_7_days": {  # Open-Meteo forecast, so the advisor can answer weather questions
                    "total_rain_mm": round(float(next7["rain_mm"].sum()), 1),
                    "rainy_days": int((next7["rain_mm"] >= 2.5).sum()),
                    "max_temp_c": round(float(next7["t_max"].max()), 1),
                    "min_temp_c": round(float(next7["t_min"].min()), 1),
                    "avg_humidity_pct": round(float(next7["humidity"].mean())),
                    "soil_moisture_pct_today": round(float(st["soil_moisture"].iloc[today_idx]), 1),
                }}
    prediction = {
        "farm_id": farm_id, "as_of_date": today.isoformat(), "crop": crop.name, "model_version": model.version,
        "days_to_harvest": round(float(now["days_to_harvest"]), 1),
        **{k: summary[k] for k in ("recommended_harvest_date", "window_start", "window_end", "harvest_status")},
        "readiness_now": round(float(now["harvest_readiness"]), 3),
        "health_now": round(float(now["crop_health_index"]), 3),
        "maturity_pct": round(float(now["maturity_pct"]), 1),
        "expected_yield_kg_ha": round(float(now["expected_yield_kg_ha"]), 1),
        # weather_basis: "forecast" (Open-Meteo) or "climate_normal" (district average, beyond the forecast range)
        "curve": [{"date": d.date().isoformat(), "readiness": round(r, 3), "health": round(h, 3), "maturity_pct": round(m, 1),
                   "weather_basis": "forecast" if d in fc_dates or d <= last_known else "climate_normal"}
                  for d, r, h, m in curve.itertuples(index=False)],
        "alerts": alerts, "market": market, "farm": farm_ctx,
    }
    prediction["id"] = storage.insert_prediction(prediction)
    return prediction


def run_all(collect: bool = True) -> list[dict]:
    out = []
    for f in storage.list_farms():
        try:
            out.append(run_inference(f["farm_id"], collect=collect))
        except Exception as e:
            print(f"[inference] {f['farm_id']}: {type(e).__name__}: {e}")
    return out
