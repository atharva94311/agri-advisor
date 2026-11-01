"""data.gov.in (Agmarknet) "Current daily price of various commodities from various markets" client.

Needs a free API key from https://data.gov.in (sign up -> My Account -> API key) in MANDI_API_KEY.
The resource only holds the latest day's prices, so price history (and the 7-day trend) builds up in
agri_data.db as the daily collector runs. Commodity names are the same as the Kaggle mandi dataset
(which is a scrape of this resource), so crops.py `mandi_commodities` already match.
"""
from __future__ import annotations

import re

import pandas as pd

from .. import config
from .http import get

COLUMNS = ["date", "state", "district", "market", "commodity", "min_price", "max_price", "modal_price"]


def _norm_key(k: str) -> str:
    return re.sub(r"[^a-z]+", "_", k.replace("_x0020_", "_").lower()).strip("_")


def _norm_name(name: str) -> str:
    return re.sub(r"\s+", "", str(name)).lower()


def prices(commodities: tuple, state: str | None = None, district: str | None = None, limit: int = 1000) -> pd.DataFrame:
    if not config.MANDI_API_KEY:
        raise RuntimeError("MANDI_API_KEY is not set. Get a free key at https://data.gov.in and add it to .env")
    records = []
    for commodity in commodities:
        js = get(config.MANDI_API_URL, {"api-key": config.MANDI_API_KEY, "format": "json", "limit": limit,
                                         "filters[commodity]": commodity}).json()
        if "records" not in js:
            raise RuntimeError(f"data.gov.in error: {js.get('error') or js.get('message') or js}")
        records += [{_norm_key(k): v for k, v in r.items()} for r in js["records"]]
    if not records:
        return pd.DataFrame(columns=COLUMNS)

    df = pd.DataFrame(records)
    # The API's commodity filter is a loose text match (e.g. "...(Whole)" also returns lentils), so keep exact
    # matches only, ignoring spacing/case ("Lentil (Masur)(Whole)" == "Lentil(Masur)(Whole)").
    wanted = {_norm_name(c) for c in commodities}
    df = df[df["commodity"].map(_norm_name).isin(wanted)]
    if df.empty:
        return pd.DataFrame(columns=COLUMNS)
    df["date"] = pd.to_datetime(df["arrival_date"], dayfirst=True, errors="coerce").dt.date.astype(str)
    for c in ("min_price", "max_price", "modal_price"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["modal_price"])
    # Only the farm's own district, else its own state. No prices from other states are substituted.
    for col, val in (("district", district), ("state", state)):
        if val:
            local = df[df[col].str.strip().str.lower() == val.strip().lower()]
            if len(local):
                return local[COLUMNS].reset_index(drop=True)
    return pd.DataFrame(columns=COLUMNS)
