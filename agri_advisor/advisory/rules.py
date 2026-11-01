"""Advisory rules: weather alerts, harvest timing alerts, market summary and the planting calendar."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from ..crops import CropProfile


def _alert(kind: str, severity: str, when, advice: str, **detail) -> dict:
    when = pd.Timestamp(when).date().isoformat() if when is not None else None
    return {"type": kind, "severity": severity, "date": when, "advice": advice,
            "detail": {k: round(v, 1) if isinstance(v, float) else v for k, v in detail.items()}}


def weather_alerts(crop: CropProfile, next7: pd.DataFrame, soil_moisture: float, maturity_pct: float,
                   readiness: float) -> list[dict]:
    """Protective advice from the next 7 days of forecast weather (rows from agronomy.daily_state)."""
    alerts: list[dict] = []
    if next7.empty:
        return alerts
    near_harvest = maturity_pct >= 90 or readiness >= 0.5
    rain = next7["rain_mm"].to_numpy()
    rain3 = pd.Series(rain).rolling(3, min_periods=1).sum()

    if rain.max() >= 50 or rain3.max() >= 75:
        i = int(rain.argmax())
        advice = ("Heavy rain expected. If the crop is ready, harvest before the rain and store produce under cover."
                  if near_harvest else "Heavy rain expected. Clear field drains and avoid spraying or fertilising before it.")
        alerts.append(_alert("heavy_rain", "high", next7["date"].iloc[i], advice,
                             max_day_rain_mm=float(rain.max()), max_3day_rain_mm=float(rain3.max())))

    hot = next7[next7["t_max"] >= crop.heat_tmax]
    if len(hot):
        alerts.append(_alert("heat_stress", "high" if len(hot) >= 3 else "medium", hot["date"].iloc[0],
                             "High temperatures expected. Irrigate in the early morning or evening and avoid field work at midday.",
                             days=len(hot), max_temp_c=float(hot["t_max"].max()), crop_limit_c=crop.heat_tmax))

    cold = next7[next7["t_min"] <= max(crop.cold_tmin, 2.0)]
    if len(cold):
        frost = bool((cold["t_min"] <= 2.0).any())
        alerts.append(_alert("frost" if frost else "cold_stress", "high" if frost else "medium", cold["date"].iloc[0],
                             "Frost risk. Give a light irrigation in the evening and protect nurseries/young plants."
                             if frost else "Cold nights expected. Light irrigation helps protect the crop.",
                             days=len(cold), min_temp_c=float(cold["t_min"].min())))

    humid = next7[(next7["humidity"] >= 85) & next7["t_mean"].between(18, 30)]
    if len(humid) >= 3:
        alerts.append(_alert("disease_risk", "medium", humid["date"].iloc[0],
                             "Warm, humid days favour fungal disease. Inspect leaves and consult your local extension officer before spraying.",
                             humid_days=len(humid)))

    if not near_harvest and rain.sum() < 2 and soil_moisture < crop.moisture_min + 5:
        alerts.append(_alert("dry_spell", "medium", next7["date"].iloc[0],
                             "No rain expected and the soil is drying. Plan an irrigation this week.",
                             rain_next_7d_mm=float(rain.sum()), soil_moisture_pct=float(soil_moisture)))
    if soil_moisture > crop.moisture_max:
        alerts.append(_alert("waterlogging", "medium", next7["date"].iloc[0],
                             "The soil is waterlogged. Open drainage channels to protect the roots.",
                             soil_moisture_pct=float(soil_moisture)))
    return alerts


def harvest_alerts(crop: CropProfile, summary: dict, today: date) -> list[dict]:
    start, end = date.fromisoformat(summary["window_start"]), date.fromisoformat(summary["window_end"])
    if start <= today <= end:
        return [_alert("harvest_now", "high", today, "The crop is in its best harvest window now.",
                       window_end=summary["window_end"])]
    if today < start <= today + timedelta(days=7):
        return [_alert("prepare_harvest", "medium", start,
                       "Harvest window starts within a week. Arrange labour, machines, bags and dry storage.",
                       window_start=summary["window_start"])]
    if today > end:
        return [_alert("harvest_overdue", "high", today,
                       "The best harvest window has passed. Harvest as soon as possible to limit losses.",
                       window_end=summary["window_end"])]
    return []


def market_summary(crop: CropProfile, state: str | None, recent: pd.DataFrame) -> dict:
    if recent is None or recent.empty:
        return {"available": False}
    df = recent.copy()
    df["date"] = pd.to_datetime(df["date"])
    latest = df["date"].max()
    now = df[df["date"] == latest]
    avg_now = float(now["modal_price"].mean())
    past = df[df["date"] <= latest - pd.Timedelta(days=6)]
    trend = None
    if len(past):
        avg_past = float(past[past["date"] == past["date"].max()]["modal_price"].mean())
        trend = round(100 * (avg_now - avg_past) / avg_past, 1)

    best = now.sort_values("modal_price", ascending=False).head(3)
    return {
        "available": True, "commodity": str(now["commodity"].iloc[0]), "latest_date": latest.date().isoformat(),
        "avg_modal_price_rs_qtl": round(avg_now), "trend_7d_pct": trend, "n_markets": int(now["market"].nunique()),
        "best_markets": [{"market": r.market, "modal_price_rs_qtl": r.modal_price} for r in best.itertuples()],
    }


def crop_calendar(crop: CropProfile, today: date) -> dict:
    """Next sowing window for this crop and the harvest timing that sowing implies (planting schedule)."""
    options = []
    for (m1, d1), (m2, d2) in crop.sow_windows:
        for year in (today.year, today.year + 1):
            start, end = date(year, m1, d1), date(year, m2, d2)
            if end >= today:
                options.append((start, end))
                break
    start, end = min(options)
    return {
        "season": crop.season, "next_sowing_window": {"start": start.isoformat(), "end": end.isoformat()},
        "typical_duration_days": crop.duration_days,
        "expected_harvest_if_sown_in_window": {
            "start": (start + timedelta(days=crop.duration_days)).isoformat(),
            "end": (end + timedelta(days=crop.duration_days)).isoformat(),
        },
    }
