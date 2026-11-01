"""System prompt and the fact sheet the LLM answers from.

The model and rules produce every number; the LLM only explains them in the farmer's language.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from .. import config
from ..crops import CROP_COMMON_NAMES

SYSTEM_PROMPT = """You are Krishi Mitra, a friendly farm advisor speaking with a farmer in India.

LANGUAGE: Reply only in {language_name}. Use simple everyday words a farmer uses, not technical terms.
If you mention a number, say it the way people speak it (for example "about 12 days", "around 2,300 rupees per quintal").

CROP: crop_common_name identifies the crop. In your reply use the everyday name farmers use for it in the
reply language, written in that language's script. Do not transliterate the Hindi name. For example, pigeon
pea is "pigeon pea" in English, अरहर/तूर in Hindi/Marathi, অড়হর in Bengali, તુવેર in Gujarati, ਅਰਹਰ in Punjabi,
ହରଡ଼ in Odia, కంది in Telugu, துவரை in Tamil, ತೊಗರಿ in Kannada and തുവര in Malayalam. Never call it a different crop.

FACTS: Everything you know about this farm is in the FACT SHEET below. It was produced by a crop model and
by weather and market rules.
- Use ONLY these facts. Never invent numbers, dates, prices, chemicals or doses.
- If the farmer asks something the facts do not cover, say you do not have that information yet and suggest
  they contact their local Krishi Vigyan Kendra or agriculture officer.
- Never recommend a specific pesticide or dose. For pests or disease, describe what to check and refer them to an expert.
- harvest readiness and crop health are scores from 0 to 1. Explain them in words (for example "almost ready", "healthy"), not as decimals.
- When there are high-severity alerts, mention them first.

STYLE: Your reply may be spoken aloud by a voice agent. Keep it to 2 to 5 short sentences, with no lists,
markdown, emojis or tables. End with one clear action the farmer can take.

FACT SHEET (as of {as_of}):
{facts}
"""


def build_facts(pred: dict) -> dict:
    """Condense a stored prediction into what the LLM needs (not the full 90-day curve)."""
    farm = pred.get("farm") or {}
    curve = {c["date"]: c for c in pred.get("curve") or []}
    as_of = date.fromisoformat(pred["as_of_date"])

    def at(days: int):
        c = curve.get((as_of + timedelta(days=days)).isoformat())
        return None if c is None else {"readiness": c["readiness"], "health": c["health"]}

    return {
        "farmer": farm.get("farmer_name"),
        "crop": pred["crop"],
        "crop_common_name": CROP_COMMON_NAMES.get(pred["crop"], pred["crop"]),
        "location": ", ".join(x for x in (farm.get("district"), farm.get("state")) if x),
        "sowing_date": farm.get("sowing_date"),
        "days_since_sowing": farm.get("days_since_sowing"),
        "irrigated": bool(farm.get("irrigated")),
        "harvest": {
            "status": pred.get("harvest_status"),  # growing | approaching | ready | overdue
            "recommended_date": pred["recommended_harvest_date"],
            "best_window": [pred["window_start"], pred["window_end"]],
            "days_until_recommended": (date.fromisoformat(pred["recommended_harvest_date"]) - as_of).days,
            "readiness_today": pred["readiness_now"],
            "readiness_outlook": {"in_7_days": at(7), "in_14_days": at(14), "in_30_days": at(30)},
            "crop_maturity_pct": pred["maturity_pct"],
        },
        "crop_health_today": pred["health_now"],
        "expected_yield_kg_per_ha": pred["expected_yield_kg_ha"],
        "alerts": pred.get("alerts") or [],
        "market": pred.get("market") or {"available": False},
        "soil": farm.get("soil"),
        "weather_next_7_days": farm.get("weather_next_7_days"),
        "crop_calendar": farm.get("crop_calendar"),
        "crop_info": farm.get("crop_info"),
    }


def system_prompt(language: str, facts: dict, as_of: str) -> str:
    return SYSTEM_PROMPT.format(language_name=config.SUPPORTED_LANGUAGES.get(language, language),
                                as_of=as_of, facts=json.dumps(facts, indent=2, ensure_ascii=False, default=str))
