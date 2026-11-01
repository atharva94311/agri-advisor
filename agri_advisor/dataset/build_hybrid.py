"""Build the hybrid harvest-forecasting dataset from 4 Kaggle sources + agronomic simulation.

No public dataset has (soil + daily weather + crop stage + harvest outcome) together, so each simulated
"field-season" is stitched from real distributions:

    crop_production.csv      -> where the crop is grown (state, district, weighted by area) + base yield
    rainfall normals         -> that district's monthly rainfall, used to simulate daily rain
    Crop_recommendation.csv  -> soil N/pH + season temperature/humidity for the crop (P/K are not used:
                                no live source for them)
    Fertilizer Prediction    -> soil type + starting soil moisture for the crop

Daily weather is simulated, crop development follows growing degree days (GDD), and the targets
(harvest readiness, days to optimal harvest, health, yield) come from the agronomic label functions in
agri_advisor/agronomy.py. The model therefore learns an agronomic approximation until real outcomes from
the `harvest_outcomes` table are available to train on.
"""
from __future__ import annotations

import argparse
import re

import numpy as np
import pandas as pd

from .. import config
from ..agronomy import (TARGETS, daily_state, feature_rows, generate_weather, health_series,
                        maturity_readiness, static_features, weather_readiness)
from ..crops import CROPS, SOIL_TYPES, CropProfile
from .kaggle_download import raw_path

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def norm_key(s: str) -> str:
    return re.sub(r"[^A-Z]", "", str(s).upper().replace("&", "AND"))


# Reference tables (also used at inference time)
def build_rainfall_normals() -> pd.DataFrame:
    rf = pd.read_csv(raw_path("rainfall"))
    out = rf.rename(columns={"STATE_UT_NAME": "state", "DISTRICT": "district", "ANNUAL": "annual"})
    out = out[["state", "district"] + MONTHS + ["annual"]]
    out["state_key"] = out["state"].map(norm_key)
    out["district_key"] = out["district"].map(norm_key)
    return out


def build_base_yield(cp: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for crop in CROPS.values():
        d = cp[cp["Crop"].str.strip().isin(crop.production_names) & (cp["Area"] > 0) & (cp["Production"] > 0)].copy()
        if d.empty:
            continue
        d["yield_kg_ha"] = d["Production"] * crop.production_unit_kg / d["Area"]
        lo, hi = d["yield_kg_ha"].quantile([0.05, 0.95])
        d = d[d["yield_kg_ha"].between(lo, hi)]
        for state, g in d.groupby("State_Name"):
            if len(g) >= 3:
                rows.append((crop.name, state, g["yield_kg_ha"].median(), len(g)))
        rows.append((crop.name, "ALL", d["yield_kg_ha"].median(), len(d)))
    return pd.DataFrame(rows, columns=["crop", "state", "base_yield_kg_ha", "n_records"])


# Simulation
class Sources:
    def __init__(self):
        self.croprec = pd.read_csv(raw_path("crop_recommendation"))
        fert = pd.read_csv(raw_path("fertilizer"))
        fert.columns = [c.strip() for c in fert.columns]
        self.fert = fert
        self.cp = pd.read_csv(raw_path("crop_production"))
        self.cp["Crop"] = self.cp["Crop"].str.strip()
        self.rain = build_rainfall_normals()
        self.base_yield = build_base_yield(self.cp)
        self.national_rain = self.rain[MONTHS].mean().to_numpy()

    def locations(self, crop: CropProfile) -> pd.DataFrame:
        d = self.cp[self.cp["Crop"].isin(crop.production_names) & (self.cp["Area"] > 0)]
        return d.groupby(["State_Name", "District_Name"], as_index=False)["Area"].sum()

    def rainfall_for(self, state: str, district: str) -> tuple[np.ndarray, str]:
        m = self.rain[self.rain["district_key"] == norm_key(district)]
        if not m.empty:
            return m[MONTHS].iloc[0].to_numpy(dtype=float), "district"
        m = self.rain[self.rain["state_key"] == norm_key(state)]
        if not m.empty:
            return m[MONTHS].mean().to_numpy(dtype=float), "state"
        return self.national_rain, "national"

    def lookup(self, table: pd.DataFrame, crop: str, state: str, col: str) -> float | None:
        t = table[table["crop"] == crop]
        hit = t[t["state"] == state]
        if hit.empty:
            hit = t[t["state"] == "ALL"]
        return None if hit.empty else float(hit[col].iloc[0])

    def ideal_soil(self, crop: CropProfile) -> dict:
        if crop.croprec_label:
            med = self.croprec[self.croprec["label"] == crop.croprec_label][["N", "ph"]].median()
            return med.to_dict()
        return {k: float(np.mean(crop.climate_prior[k])) for k in ("N", "ph")}


def sample_season(src: Sources, crop: CropProfile, locs: pd.DataFrame, rng: np.random.Generator,
                  season_id: int, snapshot_every: int) -> pd.DataFrame | None:
    # --- location (crop_production) + rainfall normals ---
    loc = locs.iloc[rng.choice(len(locs), p=locs["Area"] / locs["Area"].sum())]
    state, district = loc["State_Name"], loc["District_Name"]
    monthly_rain, rain_src = src.rainfall_for(state, district)

    # --- soil + season climate (crop_recommendation, or agronomic prior for wheat) ---
    if crop.croprec_label:
        r = src.croprec[src.croprec["label"] == crop.croprec_label].sample(1, random_state=rng).iloc[0]
        soil = {"N": max(0, r["N"] * rng.normal(1, 0.05)), "ph": r["ph"] + rng.normal(0, 0.1)}
        # Pull toward the crop's reference temperature: crop_recommendation spans a wider range than the
        # season-average temperatures the crop durations are calibrated for.
        base_temp = crop.ref_temp + 0.5 * (r["temperature"] - crop.ref_temp) + rng.normal(0, 0.5)
        base_hum = r["humidity"]
        soil_src = "kaggle_crop_recommendation"
    else:
        pr = crop.climate_prior
        soil = {k: rng.uniform(*pr[k]) for k in ("N", "ph")}
        base_temp, base_hum = rng.uniform(*pr["temperature"]), rng.uniform(*pr["humidity"])
        soil_src = "agronomic_prior"

    # --- soil type + starting moisture (fertilizer dataset) ---
    f = src.fert[src.fert["Crop Type"] == crop.fert_crop_type] if crop.fert_crop_type else src.fert.iloc[:0]
    if f.empty:
        soil_type, moisture0 = str(rng.choice(SOIL_TYPES)), rng.uniform(30, 55)
    else:
        fr = f.sample(1, random_state=rng).iloc[0]
        soil_type, moisture0 = fr["Soil Type"], float(fr["Moisture"])
    irrigated = bool(rng.random() < crop.irrigated_prob)

    # --- sowing date ---
    (m1, d1), (m2, d2) = crop.sow_windows[rng.integers(len(crop.sow_windows))]
    year = int(rng.integers(2016, 2026))
    start = pd.Timestamp(year, m1, d1)
    sow = start + pd.Timedelta(days=int(rng.integers(0, (pd.Timestamp(year, m2, d2) - start).days + 1)))

    # --- simulate the season ---
    variety_factor = rng.uniform(0.9, 1.1)
    gdd_required = crop.gdd_maturity * variety_factor
    w = generate_weather(sow, int(crop.duration_days * 2.5), base_temp, base_hum, monthly_rain, rng,
                         center_days=crop.duration_days, rain_factor=float(rng.lognormal(0, 0.3)))
    st = daily_state(w, crop, soil_type, irrigated, moisture0)

    m = (st["gdd_cum"] / gdd_required).to_numpy()
    end_m = 1 + crop.window_frac + 3 * crop.decay_frac
    if m[-1] < end_m:
        return None  # season too cold to finish in the simulated horizon
    end = int(np.argmax(m >= end_m)) + 5
    st, m = st.iloc[:end].copy(), m[:end]

    readiness = maturity_readiness(m, crop) * weather_readiness(st["rain_next_3d"].to_numpy(), crop)
    ideal = src.ideal_soil(crop)
    deficiency = max(0.0, 1 - soil["N"] / max(ideal["N"], 1))
    ph_pen = max(0.0, abs(soil["ph"] - ideal["ph"]) - 0.5) * 0.15
    health = health_series(st, crop, float(np.clip(1 - 0.35 * deficiency - ph_pen, 0.5, 1.0)))

    in_window = (m >= 1.0) & (m <= 1 + crop.window_frac)
    opt_day = int(np.argmax(np.where(in_window, readiness, -1))) if in_window.any() else int(np.argmax(readiness))
    if opt_day > 1.6 * crop.duration_days:
        return None  # unrealistically slow season
    keep = min(len(st), opt_day + 60)  # cover overdue farms too
    st, m, readiness, health = st.iloc[:keep].copy(), m[:keep], readiness[:keep], health[:keep]

    base_yield = src.lookup(src.base_yield, crop.name, state, "base_yield_kg_ha") or crop.fallback_yield_kg_ha
    exp_yield = base_yield * (0.35 + 0.65 * health[: opt_day + 1].mean()) * rng.lognormal(0, 0.08)

    # Forecast features are noisy (real forecasts are imperfect); labels above used the true weather.
    st["rain_next_3d"] *= rng.lognormal(0, 0.35, len(st))
    st["rain_next_7d"] *= rng.lognormal(0, 0.3, len(st))
    st["tmax_next_7d"] += rng.normal(0, 1.0, len(st))
    st["tmean_next_7d"] += rng.normal(0, 0.8, len(st))

    annual = float(np.sum(monthly_rain))
    rows = feature_rows(st, static_features(crop, soil, soil_type, irrigated, sow, annual))
    rows["days_to_harvest"] = opt_day - st["days_since_sowing"]
    rows["harvest_readiness"] = readiness
    rows["crop_health_index"] = health
    rows["maturity_pct"] = np.minimum(100 * m, 150)
    rows["expected_yield_kg_ha"] = exp_yield

    idx = np.arange(0, len(rows), snapshot_every)  # from sowing day, so new farms are in range
    rows = rows.iloc[idx].copy()
    rows.insert(0, "season_id", season_id)
    rows.insert(1, "state", state)
    rows.insert(2, "district", district)
    rows.insert(3, "sowing_date", sow.date().isoformat())
    rows.insert(4, "obs_date", (sow + pd.to_timedelta(rows["days_since_sowing"], unit="D")).dt.date.astype(str))
    rows["optimal_harvest_date"] = (sow + pd.Timedelta(days=opt_day)).date().isoformat()
    rows["rain_source"] = rain_src
    rows["soil_climate_source"] = soil_src
    return rows


def build(seasons_per_crop: int = 400, snapshot_every: int = 5, seed: int = 42) -> pd.DataFrame:
    config.ensure_dirs()
    rng = np.random.default_rng(seed)
    src = Sources()

    src.rain.drop(columns=["state_key", "district_key"]).to_csv(config.RAINFALL_NORMALS_PATH, index=False)
    src.base_yield.to_csv(config.BASE_YIELD_PATH, index=False)

    frames, season_id, skipped = [], 0, 0
    for crop in CROPS.values():
        locs = src.locations(crop)
        for _ in range(seasons_per_crop):
            rows = sample_season(src, crop, locs, rng, season_id, snapshot_every)
            if rows is None:
                skipped += 1
                continue
            frames.append(rows)
            season_id += 1
        print(f"  {crop.name:<12} done")
    df = pd.concat(frames, ignore_index=True)
    num = df.select_dtypes("number").columns
    df[num] = df[num].round(4)
    df.to_csv(config.DATASET_PATH, index=False)

    print(f"\nWrote {len(df):,} rows / {df['season_id'].nunique():,} seasons -> {config.DATASET_PATH}")
    print(f"Skipped {skipped} seasons that never matured or matured unrealistically slowly.")
    summary = df.groupby("crop").apply(
        lambda g: pd.Series({
            "seasons": g["season_id"].nunique(),
            "median_days_to_opt_harvest": (g["days_since_sowing"] + g["days_to_harvest"]).groupby(g["season_id"]).first().median(),
            "profile_duration": CROPS[g.name].duration_days,
            "median_yield_kg_ha": g["expected_yield_kg_ha"].median(),
            "mean_health": g["crop_health_index"].mean(),
        }), include_groups=False)
    print(summary.round(2).to_string())
    print("\nTarget ranges:")
    print(df[TARGETS].describe().T[["mean", "min", "max"]].round(2).to_string())
    return df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons-per-crop", type=int, default=400)
    ap.add_argument("--snapshot-every", type=int, default=5)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    build(a.seasons_per_crop, a.snapshot_every, a.seed)
