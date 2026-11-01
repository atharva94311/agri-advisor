"""Farm registration: validates the crop and fills state/district from lat/lon when missing."""
from __future__ import annotations

from datetime import date

from .. import storage
from ..crops import SOIL_TYPES, get_crop
from . import geocode


def register_farm(farm: dict, lookup_location: bool = True) -> dict:
    farm = dict(farm)
    farm["crop"] = get_crop(farm["crop"]).name
    date.fromisoformat(farm["sowing_date"])  # validates YYYY-MM-DD
    if farm.get("soil_type") and farm["soil_type"] not in SOIL_TYPES:
        raise ValueError(f"soil_type must be one of {SOIL_TYPES}")
    farm["irrigated"] = int(bool(farm.get("irrigated")))
    if lookup_location and (not farm.get("state") or not farm.get("district")):
        try:
            loc = geocode.reverse(float(farm["latitude"]), float(farm["longitude"]))
            farm["state"] = farm.get("state") or loc["state"]
            farm["district"] = farm.get("district") or loc["district"]
        except Exception as e:
            print(f"[register] reverse geocoding failed ({type(e).__name__}: {e}); state/district left empty")
    storage.upsert_farm(farm)
    return storage.get_farm(farm["farm_id"])
