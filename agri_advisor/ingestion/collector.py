"""APIs -> data DB. Pulls soil, weather (history since sowing + forecast), crop info and mandi prices for
a farm and stores them in agri_data.db."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from .. import config, storage
from ..agronomy import WEATHER_COLS
from ..crops import get_crop
from .soil_compat import merge_soil
from .sources import Sources, get_sources


def _check_weather(df: pd.DataFrame, what: str) -> pd.DataFrame:
    missing = [c for c in WEATHER_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"{what} is missing columns {missing}")
    df = df[WEATHER_COLS].copy()
    df["date"] = pd.to_datetime(df["date"])
    return df


def collect_for_farm(farm_id: str, sources: Sources | None = None, today: date | None = None) -> dict:
    sources = sources or get_sources()
    today = today or date.today()
    farm = storage.get_farm(farm_id)
    if not farm:
        raise KeyError(f"Unknown farm_id '{farm_id}'. Register it first.")
    crop = get_crop(farm["crop"])
    lat, lon = farm["latitude"], farm["longitude"]
    report = {"farm_id": farm_id, "ok": [], "errors": {}}

    def step(name, fn):
        try:
            fn()
            report["ok"].append(name)
        except NotImplementedError as e:
            report["errors"][name] = f"not implemented: {e}"
        except Exception as e:  # keep collecting the other sources
            report["errors"][name] = f"{type(e).__name__}: {e}"

    def soil():
        static = storage.get_soil_static(farm_id, "live")
        if static is None:
            static = sources.soil.soil(lat, lon)
            if all(static.get(k) is not None for k in ("N", "ph", "soil_type")):
                storage.set_soil_static(farm_id, "live", static)  # cache only complete readings
        merged = merge_soil(farm, static)
        merged["moisture"] = sources.soil.moisture(lat, lon, today)
        merged["moisture_at_sowing"] = sources.soil.moisture(lat, lon, date.fromisoformat(farm["sowing_date"]))
        if merged["moisture_at_sowing"] is None:
            raise ValueError("Open-Meteo returned no soil moisture for the sowing date")
        storage.insert_soil(farm_id, merged, source=static.get("source", ""), details=static)

    def weather():
        sowing = date.fromisoformat(farm["sowing_date"])
        stored = storage.get_weather(farm_id)
        observed = stored[stored["is_forecast"] == 0]
        start = (observed["date"].max().date() + timedelta(days=1)) if len(observed) else sowing
        if start <= today - timedelta(days=1):
            hist = _check_weather(sources.weather.history(lat, lon, start, today - timedelta(days=1)), "weather history")
            storage.upsert_weather(farm_id, hist, is_forecast=False)
        fc = _check_weather(sources.weather.forecast(lat, lon, config.FORECAST_DAYS), "weather forecast")
        storage.upsert_weather(farm_id, fc, is_forecast=True)

    def crop_info():
        storage.insert_crop_info(farm_id, sources.crop_info.crop_details(farm) or {})

    def mandi():
        df = sources.mandi.prices(crop.name, crop.mandi_commodities, farm.get("state"), farm.get("district"))
        if len(df):
            storage.insert_mandi(crop.name, df)

    step("soil", soil)
    step("weather", weather)
    step("crop_info", crop_info)
    step("mandi", mandi)
    return report


def collect_all() -> list[dict]:
    sources = get_sources()
    return [collect_for_farm(f["farm_id"], sources) for f in storage.list_farms()]
