"""ISRIC SoilGrids 250 m client (free, no key): topsoil pH, total nitrogen, texture, organic carbon and
WRB soil class.

The REST API is tried first. It is frequently unavailable (HTTP 503), so the WCS map service is the
fallback. WCS rasters are in Interrupted Goode Homolosine, hence pyproj. Values are the median over a
~2 km window, because SoilGrids masks urban pixels and a farm's coordinates often fall near a town.
"""
from __future__ import annotations

import io
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import numpy as np
import pyproj
import tifffile

from .. import config
from .http import get

# property -> divisor from stored integers to conventional units
PROPS = {"phh2o": 10,    # pH x 10          -> pH
         "nitrogen": 100,  # cg/kg          -> g/kg total N
         "clay": 10,     # g/kg             -> %
         "sand": 10,     # g/kg             -> %
         "soc": 10}      # dg/kg            -> g/kg organic carbon
DEPTHS = (("0-5cm", 5.0), ("5-15cm", 10.0))  # topsoil 0-15 cm, thickness-weighted
WINDOW_M = 2000

# Order of the WRB "MostProbable" raster codes (alphabetical; verified on known Indian sites:
# Yavatmal/Solapur black soil = 29 Vertisols, Jaisalmer = 4 Arenosols, Bardhaman = 11 Fluvisols).
WRB_CLASSES = ["Acrisols", "Albeluvisols", "Alisols", "Andosols", "Arenosols", "Calcisols", "Cambisols", "Chernozems",
               "Cryosols", "Durisols", "Ferralsols", "Fluvisols", "Gleysols", "Gypsisols", "Histosols", "Kastanozems",
               "Leptosols", "Lixisols", "Luvisols", "Nitisols", "Phaeozems", "Planosols", "Plinthosols", "Podzols",
               "Regosols", "Solonchaks", "Solonetz", "Stagnosols", "Umbrisols", "Vertisols"]

_IGH = pyproj.Transformer.from_crs("EPSG:4326", "+proj=igh +lat_0=0 +lon_0=0 +datum=WGS84 +units=m +no_defs",
                                   always_xy=True)


def _rest(lat: float, lon: float) -> dict:
    params = [("lon", lon), ("lat", lat), ("value", "mean")] + [("property", p) for p in PROPS] + \
             [("depth", d) for d, _ in DEPTHS]
    js = get(f"{config.SOILGRIDS_REST_URL}/properties/query", params, retries=0, timeout=25).json()
    out = {}
    for layer in js["properties"]["layers"]:
        factor = layer["unit_measure"]["d_factor"]
        vals = {d["label"]: d["values"]["mean"] for d in layer["depths"]}
        out[layer["name"]] = {d: (None if vals.get(d) is None else vals[d] / factor) for d, _ in DEPTHS}
    return out


def _wcs_value(prop: str, depth: str, lat: float, lon: float) -> float | None:
    x, y = _IGH.transform(lon, lat)
    params = {"map": f"/map/{prop}.map", "SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage",
              "COVERAGEID": f"{prop}_{depth}_mean", "FORMAT": "image/tiff",
              "SUBSET": [f"x({x - WINDOW_M},{x + WINDOW_M})", f"y({y - WINDOW_M},{y + WINDOW_M})"]}
    a = tifffile.imread(io.BytesIO(get(config.SOILGRIDS_WCS_URL, params, retries=5).content)).astype(float).ravel()
    a = a[a > 0]  # 0 = masked (urban / water / no data)
    return float(np.median(a)) / PROPS[prop] if len(a) else None


def _wcs(lat: float, lon: float) -> dict:
    jobs = [(p, d) for p in PROPS for d, _ in DEPTHS]
    with ThreadPoolExecutor(max_workers=2) as ex:  # the ISRIC server throttles bursts (HTTP 503)
        vals = list(ex.map(lambda j: _wcs_value(j[0], j[1], lat, lon), jobs))
    out: dict = {p: {} for p in PROPS}
    for (p, d), v in zip(jobs, vals):
        out[p][d] = v
    return out


@lru_cache(maxsize=256)
def properties(lat: float, lon: float) -> dict:
    """Topsoil (0-15 cm) properties: ph, nitrogen_g_kg, clay_pct, sand_pct, soc_g_kg (+ source)."""
    try:
        raw, source = _rest(lat, lon), "soilgrids-rest"
    except Exception:
        raw, source = _wcs(lat, lon), "soilgrids-wcs"
    names = {"phh2o": "ph", "nitrogen": "nitrogen_g_kg", "clay": "clay_pct", "sand": "sand_pct", "soc": "soc_g_kg"}
    out = {"source": source}
    for prop, key in names.items():
        pairs = [(raw[prop].get(d), w) for d, w in DEPTHS if raw[prop].get(d) is not None]
        out[key] = round(sum(v * w for v, w in pairs) / sum(w for _, w in pairs), 3) if pairs else None
    return out


@lru_cache(maxsize=256)
def wrb_class(lat: float, lon: float, d: float = 0.02) -> str | None:
    params = {"map": "/map/wrb.map", "SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage",
              "COVERAGEID": "MostProbable", "FORMAT": "image/tiff",
              "SUBSET": [f"long({lon - d},{lon + d})", f"lat({lat - d},{lat + d})"],
              "SUBSETTINGCRS": "http://www.opengis.net/def/crs/EPSG/0/4326",
              "OUTPUTCRS": "http://www.opengis.net/def/crs/EPSG/0/4326"}
    a = tifffile.imread(io.BytesIO(get(config.SOILGRIDS_WCS_URL, params, retries=5).content)).ravel()
    codes = Counter(int(v) for v in a if 0 <= v < len(WRB_CLASSES))
    return WRB_CLASSES[codes.most_common(1)[0][0]] if codes else None
