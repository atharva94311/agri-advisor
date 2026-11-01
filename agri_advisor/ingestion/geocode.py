"""Reverse geocoding (lat/lon -> state, district) with OpenStreetMap Nominatim. Free, no key, at most
1 request per second under its usage policy (enforced here). Used when a farm is registered without
state/district, which the rainfall normals, base yield and mandi lookups need."""
from __future__ import annotations

import time
from functools import lru_cache

from .. import config
from .http import get

_last_call = 0.0


@lru_cache(maxsize=1024)
def reverse(lat: float, lon: float) -> dict:
    global _last_call
    wait = 1.0 - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.monotonic()
    js = get(config.NOMINATIM_URL, {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 10,
                                    "accept-language": "en"}).json()
    addr = js.get("address", {})
    district = addr.get("state_district") or addr.get("county") or addr.get("city")
    if district:
        district = district.removesuffix(" District").removesuffix(" district")
    return {"state": addr.get("state"), "district": district}
