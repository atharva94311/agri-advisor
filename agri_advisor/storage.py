"""SQLite storage.

    agri_data.db    <- everything the API collectors fetch (farms, soil, weather, crop info, mandi prices)
    predictions.db  <- ML outputs + chat history, read by the chat / voice layer
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import pandas as pd

from . import config

DATA_SCHEMA = """
CREATE TABLE IF NOT EXISTS farms (
    farm_id TEXT PRIMARY KEY, farmer_name TEXT, phone TEXT, language TEXT DEFAULT 'en',
    latitude REAL, longitude REAL, state TEXT, district TEXT,
    crop TEXT NOT NULL, sowing_date TEXT NOT NULL, irrigated INTEGER DEFAULT 0, area_ha REAL,
    soil_type TEXT, created_at TEXT,
    -- optional farmer-entered values (e.g. Soil Health Card); they override API values
    variety TEXT, soil_n REAL, soil_ph REAL
);
CREATE TABLE IF NOT EXISTS soil_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, farm_id TEXT, fetched_at TEXT,
    N REAL, ph REAL, moisture REAL, soil_type TEXT, source TEXT,
    moisture_at_sowing REAL, details_json TEXT
);
-- raw static soil API response per farm (SoilGrids changes rarely, so it is cached)
CREATE TABLE IF NOT EXISTS soil_static (
    farm_id TEXT PRIMARY KEY, fetched_at TEXT, source_mode TEXT, payload_json TEXT
);
CREATE TABLE IF NOT EXISTS weather_daily (
    farm_id TEXT, date TEXT, t_mean REAL, t_max REAL, t_min REAL, humidity REAL, rain_mm REAL,
    is_forecast INTEGER, fetched_at TEXT, PRIMARY KEY (farm_id, date)
);
CREATE TABLE IF NOT EXISTS crop_info (
    farm_id TEXT, fetched_at TEXT, payload_json TEXT
);
CREATE TABLE IF NOT EXISTS mandi_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, fetched_at TEXT, date TEXT, state TEXT, district TEXT,
    market TEXT, commodity TEXT, crop TEXT, min_price REAL, max_price REAL, modal_price REAL
);
-- harvest outcomes reported by farmers, for retraining
CREATE TABLE IF NOT EXISTS harvest_outcomes (
    farm_id TEXT, harvest_date TEXT, yield_kg_ha REAL, quality_notes TEXT, recorded_at TEXT
);
"""

PREDICTIONS_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, farm_id TEXT, created_at TEXT, as_of_date TEXT, crop TEXT,
    model_version TEXT, days_to_harvest REAL, recommended_harvest_date TEXT, window_start TEXT,
    window_end TEXT, harvest_status TEXT, readiness_now REAL, health_now REAL, maturity_pct REAL, expected_yield_kg_ha REAL,
    curve_json TEXT, alerts_json TEXT, market_json TEXT, farm_json TEXT
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, farm_id TEXT, session_id TEXT, role TEXT, content TEXT,
    language TEXT, created_at TEXT
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# Columns added after the first release: added in place to databases created earlier.
MIGRATIONS = {
    "farms": {"variety": "TEXT", "soil_n": "REAL", "soil_ph": "REAL"},
    "soil_readings": {"moisture_at_sowing": "REAL", "details_json": "TEXT"},
    "predictions": {"harvest_status": "TEXT"},
}


def _migrate(con: sqlite3.Connection) -> None:
    for table, cols in MIGRATIONS.items():
        existing = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        if not existing:
            continue
        for col, typ in cols.items():
            if col not in existing:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")


@contextmanager
def _connect(path, schema):
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.executescript(schema)
    _migrate(con)
    try:
        yield con
        con.commit()
    finally:
        con.close()


def data_db():
    return _connect(config.DATA_DB_PATH, DATA_SCHEMA)


def predictions_db():
    return _connect(config.PREDICTIONS_DB_PATH, PREDICTIONS_SCHEMA)


# --- farms -----------------------------------------------------------------------------------
def upsert_farm(farm: dict) -> None:
    cols = ["farm_id", "farmer_name", "phone", "language", "latitude", "longitude", "state", "district",
            "crop", "sowing_date", "irrigated", "area_ha", "soil_type", "variety", "soil_n", "soil_ph"]
    row = {c: farm.get(c) for c in cols}
    row["created_at"] = now_iso()
    with data_db() as con:
        con.execute(f"INSERT OR REPLACE INTO farms ({','.join(row)}) VALUES ({','.join('?' * len(row))})",
                    list(row.values()))


def get_farm(farm_id: str) -> dict | None:
    with data_db() as con:
        r = con.execute("SELECT * FROM farms WHERE farm_id = ?", (farm_id,)).fetchone()
    return dict(r) if r else None


def list_farms() -> list[dict]:
    with data_db() as con:
        return [dict(r) for r in con.execute("SELECT * FROM farms ORDER BY farm_id")]


# --- collected data --------------------------------------------------------------------------
def insert_soil(farm_id: str, soil: dict, source: str, details: dict | None = None) -> None:
    with data_db() as con:
        con.execute("INSERT INTO soil_readings (farm_id, fetched_at, N, ph, moisture, soil_type, source, "
                    "moisture_at_sowing, details_json) VALUES (?,?,?,?,?,?,?,?,?)",
                    (farm_id, now_iso(), soil.get("N"), soil.get("ph"),
                     soil.get("moisture"), soil.get("soil_type"), source, soil.get("moisture_at_sowing"),
                     json.dumps(details or {}, default=str)))


def get_soil_static(farm_id: str, source_mode: str, max_age_days: int = 180) -> dict | None:
    with data_db() as con:
        r = con.execute("SELECT fetched_at, payload_json FROM soil_static WHERE farm_id = ? AND source_mode = ?",
                        (farm_id, source_mode)).fetchone()
    if not r:
        return None
    age = datetime.now(timezone.utc) - datetime.fromisoformat(r["fetched_at"])
    return json.loads(r["payload_json"]) if age.days <= max_age_days else None


def set_soil_static(farm_id: str, source_mode: str, payload: dict) -> None:
    with data_db() as con:
        con.execute("INSERT OR REPLACE INTO soil_static VALUES (?,?,?,?)",
                    (farm_id, now_iso(), source_mode, json.dumps(payload, default=str)))


def latest_soil(farm_id: str) -> dict | None:
    with data_db() as con:
        r = con.execute("SELECT * FROM soil_readings WHERE farm_id = ? ORDER BY id DESC LIMIT 1", (farm_id,)).fetchone()
    return dict(r) if r else None


def upsert_weather(farm_id: str, df: pd.DataFrame, is_forecast: bool) -> None:
    ts = now_iso()
    rows = [(farm_id, pd.Timestamp(r.date).date().isoformat(), r.t_mean, r.t_max, r.t_min, r.humidity, r.rain_mm,
             int(is_forecast), ts) for r in df.itertuples()]
    with data_db() as con:
        con.executemany("INSERT OR REPLACE INTO weather_daily VALUES (?,?,?,?,?,?,?,?,?)", rows)


def get_weather(farm_id: str, start: str | None = None) -> pd.DataFrame:
    q, args = "SELECT * FROM weather_daily WHERE farm_id = ?", [farm_id]
    if start:
        q += " AND date >= ?"
        args.append(start)
    with data_db() as con:
        df = pd.read_sql_query(q + " ORDER BY date", con, params=args)
    df["date"] = pd.to_datetime(df["date"])
    return df


def insert_crop_info(farm_id: str, payload: dict) -> None:
    with data_db() as con:
        con.execute("INSERT INTO crop_info VALUES (?,?,?)", (farm_id, now_iso(), json.dumps(payload)))


def latest_crop_info(farm_id: str) -> dict:
    with data_db() as con:
        r = con.execute("SELECT payload_json FROM crop_info WHERE farm_id = ? ORDER BY rowid DESC LIMIT 1",
                        (farm_id,)).fetchone()
    return json.loads(r[0]) if r else {}


def insert_mandi(crop: str, df: pd.DataFrame) -> None:
    ts = now_iso()
    rows = [(ts, str(r.date), r.state, r.district, r.market, r.commodity, crop, r.min_price, r.max_price,
             r.modal_price) for r in df.itertuples()]
    with data_db() as con:
        con.executemany("INSERT INTO mandi_prices (fetched_at, date, state, district, market, commodity, crop, "
                        "min_price, max_price, modal_price) VALUES (?,?,?,?,?,?,?,?,?,?)", rows)


def recent_mandi(crop: str, state: str | None, limit: int = 50) -> pd.DataFrame:
    q, args = "SELECT * FROM mandi_prices WHERE crop = ?", [crop]
    if state:
        q += " AND state = ?"
        args.append(state)
    with data_db() as con:
        return pd.read_sql_query(q + " ORDER BY date DESC, id DESC LIMIT ?", con, params=args + [limit])


def record_harvest_outcome(farm_id: str, harvest_date: str, yield_kg_ha: float | None, notes: str = "") -> None:
    with data_db() as con:
        con.execute("INSERT INTO harvest_outcomes VALUES (?,?,?,?,?)", (farm_id, harvest_date, yield_kg_ha, notes, now_iso()))


# --- predictions + chat ----------------------------------------------------------------------
def insert_prediction(p: dict) -> int:
    row = dict(p)
    for k in ("curve", "alerts", "market", "farm"):
        row[f"{k}_json"] = json.dumps(row.pop(k, None), default=str)
    row["created_at"] = now_iso()
    with predictions_db() as con:
        cur = con.execute(f"INSERT INTO predictions ({','.join(row)}) VALUES ({','.join('?' * len(row))})",
                          list(row.values()))
        return cur.lastrowid


def latest_prediction(farm_id: str) -> dict | None:
    with predictions_db() as con:
        r = con.execute("SELECT * FROM predictions WHERE farm_id = ? ORDER BY id DESC LIMIT 1", (farm_id,)).fetchone()
    if not r:
        return None
    p = dict(r)
    for k in ("curve", "alerts", "market", "farm"):
        p[k] = json.loads(p.pop(f"{k}_json") or "null")
    return p


def add_chat_message(farm_id: str, session_id: str, role: str, content: str, language: str) -> None:
    with predictions_db() as con:
        con.execute("INSERT INTO chat_messages (farm_id, session_id, role, content, language, created_at) "
                    "VALUES (?,?,?,?,?,?)", (farm_id, session_id, role, content, language, now_iso()))


def chat_history(session_id: str, limit: int = 20) -> list[dict]:
    with predictions_db() as con:
        rows = con.execute("SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
                           (session_id, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]
