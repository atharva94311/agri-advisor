"""Data-source interfaces and their API-backed implementations.

    Weather + soil moisture -> Open-Meteo            (free, no key)          open_meteo.py
    Soil properties         -> ISRIC SoilGrids       (free, no key)          soilgrids.py
    Mandi prices            -> data.gov.in Agmarknet (free key: MANDI_API_KEY) mandi_datagov.py
    Crop info               -> local crop profiles (no public API exists) + farmer registration
    Location                -> OpenStreetMap Nominatim (geocode.py), used at farm registration
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date

import pandas as pd

from ..crops import get_crop
from . import mandi_datagov, open_meteo, soilgrids
from .soil_compat import available_n, soil_type_from


class WeatherSource(ABC):
    @abstractmethod
    def history(self, lat: float, lon: float, start: date, end: date) -> pd.DataFrame:
        """Observed daily weather, inclusive range, one row per day, no gaps.

        Columns: date (datetime64), t_mean, t_max, t_min (deg C), humidity (% RH, daily mean), rain_mm (daily total)
        """

    @abstractmethod
    def forecast(self, lat: float, lon: float, days: int) -> pd.DataFrame:
        """Daily forecast starting today, `days` rows. Same columns as history()."""


class SoilSource(ABC):
    @abstractmethod
    def soil(self, lat: float, lon: float) -> dict:
        """Static soil properties (cached ~6 months by the collector).

        Keys (None when the source does not know): "N" on the Kaggle crop-recommendation scale,
        "ph", "soil_type" (Black|Clayey|Loamy|Red|Sandy), plus any extra info keys.
        """

    def moisture(self, lat: float, lon: float, day: date) -> float | None:
        """Root-zone volumetric soil moisture (%) on `day`, or None if unavailable."""
        return None


class CropInfoSource(ABC):
    @abstractmethod
    def crop_details(self, farm: dict) -> dict:
        """Extra crop information for this farm (all keys optional), passed to the chat layer as context."""


class MandiSource(ABC):
    @abstractmethod
    def prices(self, crop: str, commodities: tuple, state: str | None, district: str | None,
               days: int = 14) -> pd.DataFrame:
        """Recent mandi prices. Columns: date, state, district, market, commodity,
        min_price, max_price, modal_price (Rs/quintal)."""


class LiveWeatherAPI(WeatherSource):
    def history(self, lat, lon, start, end):
        return open_meteo.history(lat, lon, start, end)

    def forecast(self, lat, lon, days):
        return open_meteo.forecast(lat, lon, days)


class LiveSoilAPI(SoilSource):
    """SoilGrids gives pH, total N, texture and soil class (all the soil inputs the model uses)."""

    def soil(self, lat, lon):
        props = soilgrids.properties(lat, lon)
        try:
            wrb = soilgrids.wrb_class(lat, lon)
        except Exception:
            wrb = None
        return {
            "N": available_n(props.get("nitrogen_g_kg")), "ph": props.get("ph"),
            "soil_type": soil_type_from(wrb, props.get("clay_pct"), props.get("sand_pct")),
            "wrb_class": wrb, "clay_pct": props.get("clay_pct"), "sand_pct": props.get("sand_pct"),
            "soc_g_kg": props.get("soc_g_kg"), "total_n_g_kg": props.get("nitrogen_g_kg"), "source": props["source"],
        }

    def moisture(self, lat, lon, day):
        return open_meteo.soil_moisture_pct(lat, lon, day)


class LiveCropInfoAPI(CropInfoSource):
    """No public API provides per-farm crop details in India, so this combines the farmer's registration
    (crop, variety, sowing date) with the agronomic crop profile."""

    def crop_details(self, farm):
        crop = get_crop(farm["crop"])
        return {
            "source": "crop_profile", "variety": farm.get("variety"), "season": crop.season,
            "typical_duration_days": crop.duration_days,
            "sowing_windows": [f"{m1:02d}-{d1:02d} to {m2:02d}-{d2:02d}" for (m1, d1), (m2, d2) in crop.sow_windows],
        }


class LiveMandiAPI(MandiSource):
    def prices(self, crop, commodities, state, district, days=14):
        if not commodities:
            return pd.DataFrame(columns=mandi_datagov.COLUMNS)
        return mandi_datagov.prices(commodities, state, district)


@dataclass
class Sources:
    weather: WeatherSource
    soil: SoilSource
    crop_info: CropInfoSource
    mandi: MandiSource


def get_sources() -> Sources:
    return Sources(LiveWeatherAPI(), LiveSoilAPI(), LiveCropInfoAPI(), LiveMandiAPI())
