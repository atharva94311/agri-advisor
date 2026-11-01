"""Open-Meteo client (free, no key): daily weather history, daily forecast, soil moisture.

- History comes from the ERA5 archive API; any days it has not published yet are filled from the forecast
  API, which also serves roughly the last 92 days.
- Columns match agronomy.WEATHER_COLS exactly: deg C, % relative humidity, mm/day.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from .. import config
from ..agronomy import WEATHER_COLS
from .http import get

DAILY_VARS = {
    "temperature_2m_mean": "t_mean", "temperature_2m_max": "t_max", "temperature_2m_min": "t_min",
    "relative_humidity_2m_mean": "humidity", "precipitation_sum": "rain_mm",
}
FORECAST_PAST_LIMIT_DAYS = 90  # forecast API accepts start_date back to ~92 days ago
SOIL_MOISTURE_VAR = "soil_moisture_7_to_28cm"  # root zone, m3/m3


def _daily(url: str, lat: float, lon: float, **extra) -> pd.DataFrame:
    params = {"latitude": lat, "longitude": lon, "daily": ",".join(DAILY_VARS), "timezone": "auto", **extra}
    js = get(url, params).json()
    if js.get("error"):
        raise RuntimeError(f"Open-Meteo: {js.get('reason')}")
    d = js["daily"]
    df = pd.DataFrame({"date": pd.to_datetime(d["time"]), **{out: d[src] for src, out in DAILY_VARS.items()}})
    df[list(DAILY_VARS.values())] = df[list(DAILY_VARS.values())].astype(float)
    return df[WEATHER_COLS]


def history(lat: float, lon: float, start: date, end: date) -> pd.DataFrame:
    full = pd.date_range(start, end, freq="D")
    df = _daily(config.OPEN_METEO_ARCHIVE_URL, lat, lon, start_date=start.isoformat(), end_date=end.isoformat())
    df = df.set_index("date").reindex(full)

    missing = df.index[df.isna().any(axis=1)]
    recent_floor = pd.Timestamp(date.today() - timedelta(days=FORECAST_PAST_LIMIT_DAYS))
    missing = missing[missing >= recent_floor]
    if len(missing):
        fill = _daily(config.OPEN_METEO_FORECAST_URL, lat, lon, start_date=missing.min().date().isoformat(),
                      end_date=missing.max().date().isoformat()).set_index("date")
        df = df.combine_first(fill.reindex(full))
    return df.reset_index(names="date")[WEATHER_COLS]


def forecast(lat: float, lon: float, days: int) -> pd.DataFrame:
    return _daily(config.OPEN_METEO_FORECAST_URL, lat, lon, forecast_days=min(int(days), 16))


def soil_moisture_pct(lat: float, lon: float, day: date) -> float | None:
    """Daily mean root-zone (7-28 cm) volumetric soil moisture on `day`, in % (m3/m3 x 100)."""
    recent = day >= date.today() - timedelta(days=FORECAST_PAST_LIMIT_DAYS)
    url = config.OPEN_METEO_FORECAST_URL if recent else config.OPEN_METEO_ARCHIVE_URL
    js = get(url, {"latitude": lat, "longitude": lon, "hourly": SOIL_MOISTURE_VAR, "timezone": "auto",
                   "start_date": day.isoformat(), "end_date": day.isoformat()}).json()
    vals = np.array([v for v in js.get("hourly", {}).get(SOIL_MOISTURE_VAR, []) if v is not None], dtype=float)
    return round(float(vals.mean()) * 100, 2) if len(vals) else None
