"""Agronomy and feature engineering.

Used by the dataset builder (simulated weather) and by inference (API weather), so training and
prediction compute features the same way.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .crops import CROPS, MONTHLY_TEMP_ANOMALY, SEASONS, SOIL_CAPACITY, SOIL_TYPES, CropProfile

WEATHER_COLS = ["date", "t_mean", "t_max", "t_min", "humidity", "rain_mm"]

NUMERIC_FEATURES = [
    # static (farm / soil)
    "irrigated", "N", "ph", "district_annual_rain_mm", "sow_doy_sin", "sow_doy_cos",
    # crop progress so far
    "days_since_sowing", "gdd_cum", "gdd_progress_nominal", "gdd_7d",
    # recent weather + soil
    "tmean_7d", "tmax_7d", "tmin_7d", "humidity_7d", "rain_7d", "rain_cum", "soil_moisture",
    # accumulated stress
    "heat_stress_days", "cold_stress_days", "water_stress_days", "waterlog_days", "disease_risk_days",
    # weather forecast ahead
    "rain_next_3d", "rain_next_7d", "tmax_next_7d", "tmean_next_7d",
]
CATEGORICAL_FEATURES = {"crop": tuple(CROPS), "soil_type": SOIL_TYPES, "season": SEASONS}
TARGETS = ["days_to_harvest", "harvest_readiness", "crop_health_index", "maturity_pct", "expected_yield_kg_ha"]


# Weather helpers
def daily_temp_anomaly(dates: pd.DatetimeIndex) -> np.ndarray:
    """Smooth daily temperature anomaly interpolated from the monthly profile."""
    mid_month_doy = np.array([15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])
    xs = np.concatenate([mid_month_doy - 365, mid_month_doy, mid_month_doy + 365])
    ys = np.tile(MONTHLY_TEMP_ANOMALY, 3)
    return np.interp(dates.dayofyear.to_numpy(), xs, ys)


def generate_weather(start: pd.Timestamp, n_days: int, base_temp: float, base_humidity: float,
                     monthly_rain_mm: np.ndarray, rng: np.random.Generator, center_days: int,
                     rain_factor: float = 1.0) -> pd.DataFrame:
    """Synthetic daily weather.

    `base_temp` is the mean temperature over the first `center_days` days (the nominal crop season), so
    the crop_recommendation temperature for a crop is honoured on average while still following the
    Indian seasonal cycle. Rain follows the district's monthly normals.
    """
    dates = pd.date_range(start, periods=n_days, freq="D")
    anomaly = daily_temp_anomaly(dates)
    anomaly = anomaly - anomaly[:center_days].mean()

    noise = np.zeros(n_days)
    for i in range(1, n_days):
        noise[i] = 0.75 * noise[i - 1] + rng.normal(0, 1.2)
    t_mean = base_temp + anomaly + noise

    month_mm = np.asarray(monthly_rain_mm, dtype=float)[dates.month.to_numpy() - 1] * rain_factor
    days_in_month = dates.days_in_month.to_numpy()
    p_wet = np.clip(month_mm / (days_in_month * 10.0), 0.03, 0.85)
    wet = rng.random(n_days) < p_wet
    mean_intensity = month_mm / (days_in_month * p_wet)
    rain = np.where(wet, rng.gamma(0.8, np.maximum(mean_intensity, 0.1) / 0.8), 0.0)

    hum_noise = np.zeros(n_days)
    for i in range(1, n_days):
        hum_noise[i] = 0.7 * hum_noise[i - 1] + rng.normal(0, 3.5)
    humidity = np.clip(base_humidity + hum_noise + np.where(rain > 1, 8, 0), 10, 100)

    dtr = np.clip(14 - 0.08 * (humidity - 40) + rng.normal(0, 1, n_days), 5, 18)  # diurnal range
    return pd.DataFrame({
        "date": dates, "t_mean": t_mean, "t_max": t_mean + dtr / 2, "t_min": t_mean - dtr / 2,
        "humidity": humidity, "rain_mm": rain,
    })


def climatology_extension(last: pd.DataFrame, start: pd.Timestamp, n_days: int,
                          monthly_rain_mm: np.ndarray) -> pd.DataFrame:
    """Expected-value weather for days beyond the forecast horizon (used only at inference time)."""
    if n_days <= 0:
        return pd.DataFrame(columns=WEATHER_COLS)
    dates = pd.date_range(start, periods=n_days, freq="D")
    recent = last.tail(7)
    anomaly = daily_temp_anomaly(dates)
    ref_anomaly = daily_temp_anomaly(pd.DatetimeIndex(recent["date"])).mean()
    t_mean = recent["t_mean"].mean() + (anomaly - ref_anomaly)
    dtr = (recent["t_max"] - recent["t_min"]).mean()
    rain = np.asarray(monthly_rain_mm, dtype=float)[dates.month.to_numpy() - 1] / dates.days_in_month.to_numpy()
    return pd.DataFrame({
        "date": dates, "t_mean": t_mean, "t_max": t_mean + dtr / 2, "t_min": t_mean - dtr / 2,
        "humidity": recent["humidity"].mean(), "rain_mm": rain,
    })


# Soil water + crop state
def soil_moisture_series(w: pd.DataFrame, soil_type: str, irrigated: bool, crop: CropProfile,
                         initial: float) -> np.ndarray:
    """Daily soil-moisture bucket model (% volumetric, same scale as the fertilizer dataset)."""
    capacity = SOIL_CAPACITY.get(soil_type, 60.0)
    if crop.name == "rice":
        capacity += 25  # bunded paddy fields hold standing water
    dtr = np.maximum((w["t_max"] - w["t_min"]).to_numpy(), 1.0)
    # Hargreaves-style reference ET (mm/day), Ra ~ 15 mm/day equivalent for Indian latitudes
    et_mm = np.clip(0.0023 * (w["t_mean"].to_numpy() + 17.8) * np.sqrt(dtr) * 15, 0.5, 10)
    rain = w["rain_mm"].to_numpy()
    m = np.empty(len(w))
    cur = initial
    for i in range(len(w)):
        cur += 0.4 * rain[i] - 0.4 * et_mm[i]
        if irrigated and cur < crop.moisture_min + 5:
            cur += 25.0
        if cur > capacity:
            cur -= 0.4 * (cur - capacity)  # drainage
        cur = float(np.clip(cur, 3.0, capacity + 30))
        m[i] = cur
    return m


def daily_state(w: pd.DataFrame, crop: CropProfile, soil_type: str, irrigated: bool,
                initial_moisture: float) -> pd.DataFrame:
    """Per-day crop/weather state. `w` must start on the sowing date and be daily without gaps.

    Forward-looking columns (rain_next_*) are read from the rows *after* each day, so at inference time
    `w` should contain history + forecast + climatology.
    """
    s = w[WEATHER_COLS].reset_index(drop=True).copy()
    s["days_since_sowing"] = np.arange(len(s))
    s["soil_moisture"] = soil_moisture_series(s, soil_type, irrigated, crop, initial_moisture)

    t_eff = s["t_mean"].clip(upper=crop.t_cap)
    s["gdd"] = (t_eff - crop.t_base).clip(lower=0)
    s["gdd_cum"] = s["gdd"].cumsum()
    s["gdd_progress_nominal"] = s["gdd_cum"] / crop.gdd_maturity

    roll = lambda col, fn: getattr(s[col].rolling(7, min_periods=1), fn)()
    s["gdd_7d"] = roll("gdd", "sum")
    s["tmean_7d"] = roll("t_mean", "mean")
    s["tmax_7d"] = roll("t_max", "mean")
    s["tmin_7d"] = roll("t_min", "mean")
    s["humidity_7d"] = roll("humidity", "mean")
    s["rain_7d"] = roll("rain_mm", "sum")
    s["rain_cum"] = s["rain_mm"].cumsum()

    s["heat_stress_days"] = (s["t_max"] > crop.heat_tmax).cumsum()
    s["cold_stress_days"] = (s["t_min"] < crop.cold_tmin).cumsum()
    s["water_stress_days"] = (s["soil_moisture"] < crop.moisture_min).cumsum()
    s["waterlog_days"] = (s["soil_moisture"] > crop.moisture_max).cumsum()
    disease_day = (s["humidity"] >= 85) & s["t_mean"].between(18, 30)
    s["disease_risk_days"] = disease_day.cumsum()

    def fwd(col: str, k: int, fn: str) -> pd.Series:
        # value over days t+1 .. t+k
        rev = s[col][::-1].rolling(k, min_periods=1)
        out = getattr(rev, fn)()[::-1].shift(-1)
        return out.fillna(s[col].iloc[-1] if fn == "mean" else 0.0)

    s["rain_next_3d"] = fwd("rain_mm", 3, "sum")
    s["rain_next_7d"] = fwd("rain_mm", 7, "sum")
    s["tmax_next_7d"] = fwd("t_max", 7, "mean")
    s["tmean_next_7d"] = fwd("t_mean", 7, "mean")
    return s


def static_features(crop: CropProfile, soil: dict, soil_type: str, irrigated: bool, sowing_date: pd.Timestamp,
                    district_annual_rain_mm: float) -> dict:
    doy = sowing_date.dayofyear
    return {
        "crop": crop.name, "soil_type": soil_type, "season": crop.season, "irrigated": int(bool(irrigated)),
        "N": soil["N"], "ph": soil["ph"],
        "district_annual_rain_mm": district_annual_rain_mm,
        "sow_doy_sin": np.sin(2 * np.pi * doy / 365.25), "sow_doy_cos": np.cos(2 * np.pi * doy / 365.25),
    }


def feature_rows(state: pd.DataFrame, static: dict) -> pd.DataFrame:
    """Combine per-day state with static farm features into raw (pre-encoding) feature rows."""
    out = state[[c for c in NUMERIC_FEATURES if c in state.columns]].copy()
    for k, v in static.items():
        out[k] = v
    return out[["crop", "soil_type", "season"] + NUMERIC_FEATURES]


def to_model_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Numeric model input: numeric features + fixed one-hot columns (stable across train/inference)."""
    X = df[NUMERIC_FEATURES].astype(float).copy()
    for col, cats in CATEGORICAL_FEATURES.items():
        for cat in cats:
            X[f"{col}__{cat}"] = (df[col] == cat).astype(float)
    return X


MODEL_COLUMNS = list(NUMERIC_FEATURES) + [f"{c}__{v}" for c, cats in CATEGORICAL_FEATURES.items() for v in cats]


# Label functions (used only to create training targets in the hybrid dataset)
def maturity_readiness(m: np.ndarray, crop: CropProfile) -> np.ndarray:
    """0..1 readiness from maturity fraction m = gdd_cum / gdd_required."""
    rising = np.clip((m - 0.75) / 0.25, 0, 1) ** 2
    after = np.exp(-np.maximum(m - 1 - crop.window_frac, 0) / crop.decay_frac)
    return np.where(m <= 1 + crop.window_frac, rising, after)


def weather_readiness(rain_next_3d: np.ndarray, crop: CropProfile) -> np.ndarray:
    return 1 - crop.rain_harvest_sensitivity * np.clip(rain_next_3d / 40.0, 0, 1)


def health_series(state: pd.DataFrame, crop: CropProfile, health_cap: float) -> np.ndarray:
    tmax, tmin = state["t_max"].to_numpy(), state["t_min"].to_numpy()
    moist, hum, tmean = state["soil_moisture"].to_numpy(), state["humidity"].to_numpy(), state["t_mean"].to_numpy()
    h = np.empty(len(state))
    cur = health_cap
    for i in range(len(state)):
        pen = 0.02 * max(0.0, tmax[i] - crop.heat_tmax) / 3
        pen += 0.02 * (tmin[i] < crop.cold_tmin)
        pen += 0.012 * (moist[i] < crop.moisture_min)
        pen += 0.015 * (moist[i] > crop.moisture_max)
        pen += 0.006 * (hum[i] >= 85 and 18 <= tmean[i] <= 30)
        cur = cur - pen + 0.04 * max(0.0, health_cap - cur)
        cur = float(np.clip(cur, 0.0, 1.0))
        h[i] = cur
    return h
