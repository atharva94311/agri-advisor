"""Chat service: predictions DB -> fact sheet + system prompt -> LLM -> conversational answer."""
from __future__ import annotations

import uuid
from datetime import date

from .. import storage
from .llm import get_llm
from .prompts import build_facts, system_prompt


def _ensure_fresh_prediction(farm_id: str, max_age_days: int = 1) -> tuple[dict | None, str | None]:
    pred = storage.latest_prediction(farm_id)
    if pred and (date.today() - date.fromisoformat(pred["as_of_date"])).days <= max_age_days:
        return pred, None
    try:
        from ..ml.inference import run_inference
        return run_inference(farm_id), None
    except Exception as e:
        return pred, f"{type(e).__name__}: {e}"  # fall back to the stale prediction (or None)


def template_reply(facts: dict, message: str) -> str:
    """Deterministic English answer used until an LLM is connected (no translation)."""
    q = message.lower()
    h, m = facts["harvest"], facts["market"]
    weather = [a for a in facts["alerts"] if not a["type"].startswith(("harvest", "prepare"))]
    parts = [a["advice"] for a in weather if a["severity"] == "high"]

    if any(w in q for w in ("price", "mandi", "sell", "market", "bhav", "rate")):
        if m.get("available"):
            trend = m.get("trend_7d_pct")
            trend_txt = f", {'up' if trend > 0 else 'down'} {abs(trend)}% this week" if trend else ""
            parts.append(f"{facts['crop'].title()} is selling for about {m['avg_modal_price_rs_qtl']} rupees per quintal{trend_txt}.")
            if m.get("best_markets"):
                parts.append(f"The best price today is at {m['best_markets'][0]['market']}.")
        else:
            parts.append("I do not have mandi prices for your crop yet.")
    elif any(w in q for w in ("rain", "weather", "temperature", "heat", "frost", "barish", "mausam")):
        parts += [a["advice"] for a in weather] or ["No risky weather is expected this week."]
    elif any(w in q for w in ("health", "disease", "pest", "sick", "yellow")):
        hv = facts["crop_health_today"]
        parts.append(f"Your crop looks {'healthy' if hv >= 0.75 else 'a little stressed' if hv >= 0.5 else 'stressed'}.")
        parts.append("For pests or disease, please show the plants to your local agriculture officer.")
    elif any(w in q for w in ("sow", "plant", "next season", "buvai")):
        cal = facts.get("crop_calendar") or {}
        win = cal.get("next_sowing_window")
        if win:
            parts.append(f"The next sowing window for {facts['crop']} is {win['start']} to {win['end']}.")
    else:
        crop, (w0, w1) = facts["crop"], h["best_window"]
        if h["status"] == "overdue":
            parts.append(f"Your {crop} is past its best harvest time, which was around {w0} to {w1}. "
                         "Harvest as soon as possible to limit losses.")
        elif h["status"] == "ready":
            parts.append(f"Your {crop} is ready. Harvest now, ideally before {w1}.")
        else:
            parts.append(f"Your {crop} is {min(h['crop_maturity_pct'], 100):.0f}% mature. The best time to harvest is "
                         f"in about {h['days_until_recommended']} days, between {w0} and {w1}.")
    parts.append("Ask me about harvest time, weather, crop health or mandi prices.")
    return " ".join(dict.fromkeys(parts))


def chat(farm_id: str, message: str, session_id: str | None = None, language: str | None = None) -> dict:
    farm = storage.get_farm(farm_id)
    if not farm:
        raise KeyError(f"Unknown farm_id '{farm_id}'")
    language = language or farm.get("language") or "en"
    session_id = session_id or uuid.uuid4().hex

    pred, error = _ensure_fresh_prediction(farm_id)
    if pred is None:
        reply = "I don't have a forecast for your farm yet. Please try again after your farm data has been collected."
        return {"reply": reply, "session_id": session_id, "language": language, "used_llm": False, "error": error}

    facts = build_facts(pred)
    llm = get_llm()
    if llm:
        history = storage.chat_history(session_id)
        reply = llm.complete(system_prompt(language, facts, pred["as_of_date"]),
                             history + [{"role": "user", "content": message}])
    else:
        reply = template_reply(facts, message)

    storage.add_chat_message(farm_id, session_id, "user", message, language)
    storage.add_chat_message(farm_id, session_id, "assistant", reply, language)
    return {"reply": reply, "session_id": session_id, "language": language, "used_llm": llm is not None,
            "prediction_id": pred.get("id"), "as_of_date": pred["as_of_date"], "warning": error}
