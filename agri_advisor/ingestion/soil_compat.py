"""Convert real soil API values into the exact scale/categories the model was trained on.

Training data (Kaggle) uses:
    N        -> Crop_recommendation.csv scale (0-140, roughly kg/ha available nitrogen)
    ph       -> pH units
    soil_type-> Black | Clayey | Loamy | Red | Sandy  (Fertilizer Prediction.csv)
    moisture -> % volumetric (Fertilizer Prediction.csv, 25-65)

Farmer-entered values (e.g. Soil Health Card) take priority over API values.
"""
from __future__ import annotations

from ..crops import SOIL_TYPES

# Available N (kg/ha) from total N (g/kg): 0-15 cm topsoil at bulk density 1.5 g/cm3 weighs ~2.24e6 kg/ha;
# ~2% of total N is mineralisable in a season -> 2.24e6 / 1000 * 0.02 = 44.8 kg/ha per g/kg.
N_AVAILABLE_PER_G_KG = 44.8

RED_SOIL_WRB = {"Acrisols", "Alisols", "Ferralsols", "Lixisols", "Nitisols", "Plinthosols"}


def soil_type_from(wrb: str | None, clay_pct: float | None, sand_pct: float | None) -> str | None:
    """Map SoilGrids WRB class + texture onto the 5 Indian soil types used in training."""
    if wrb == "Vertisols":
        return "Black"
    if wrb == "Arenosols" or (sand_pct is not None and sand_pct >= 70):
        return "Sandy"
    if wrb in RED_SOIL_WRB:
        return "Red"
    if clay_pct is not None and clay_pct >= 40:
        return "Clayey"
    if wrb is None and clay_pct is None:
        return None
    return "Loamy"


def available_n(nitrogen_g_kg: float | None) -> float | None:
    return None if nitrogen_g_kg is None else round(min(140.0, max(0.0, nitrogen_g_kg * N_AVAILABLE_PER_G_KG)), 1)


def merge_soil(farm: dict, api: dict) -> dict:
    """Farmer-entered values (Soil Health Card) override SoilGrids. Raises if neither has a value."""
    out = {}
    for key, farm_key in (("N", "soil_n"), ("ph", "soil_ph")):
        val = farm.get(farm_key) if farm.get(farm_key) is not None else api.get(key)
        if val is None:
            raise ValueError(f"No soil {key} from SoilGrids at this location; register the farm with {farm_key} "
                             f"from its Soil Health Card.")
        out[key] = float(val)
    soil_type = farm.get("soil_type") or api.get("soil_type")
    if soil_type not in SOIL_TYPES:
        raise ValueError(f"Soil type unknown at this location; register the farm with soil_type (one of {SOIL_TYPES}).")
    out["soil_type"] = soil_type
    return out
