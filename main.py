"""Command-line entry point.

    python main.py download-data          # Kaggle -> data/raw
    python main.py build-dataset          # data/raw -> data/processed/hybrid_harvest_dataset.csv
    python main.py train                  # dataset -> models/harvest_model.joblib
    python main.py add-farm --id F1 --lat 30.85 --lon 75.75 --crop wheat --sown 2026-10-28 [--irrigated] [--language pa]
    python main.py farms                  # list registered farms
    python main.py collect [--farm ID]    # live APIs -> agri_data.db
    python main.py predict [--farm ID]    # agri_data.db -> model -> predictions.db
    python main.py chat --farm ID         # talk to the advisor in the terminal
    python main.py serve                  # HTTP API on :8000
"""
import argparse
import json

from agri_advisor import config, storage


def main():
    ap = argparse.ArgumentParser(description="Multilingual agri advisory assistant")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("download-data")
    b = sub.add_parser("build-dataset")
    b.add_argument("--seasons-per-crop", type=int, default=400)
    b.add_argument("--seed", type=int, default=42)
    t = sub.add_parser("train")
    t.add_argument("--sample-seasons", type=int)
    f = sub.add_parser("add-farm", help="register a real farm (state/district are looked up from lat/lon)")
    f.add_argument("--id", required=True)
    f.add_argument("--lat", type=float, required=True)
    f.add_argument("--lon", type=float, required=True)
    f.add_argument("--crop", required=True)
    f.add_argument("--sown", required=True, help="sowing date YYYY-MM-DD")
    f.add_argument("--irrigated", action="store_true")
    f.add_argument("--language", default="en")
    f.add_argument("--name")
    f.add_argument("--soil-type", help="Black|Clayey|Loamy|Red|Sandy (default: detected from SoilGrids)")
    sub.add_parser("farms")
    for name in ("collect", "predict"):
        p = sub.add_parser(name)
        p.add_argument("--farm")
        if name == "predict":
            p.add_argument("--no-collect", action="store_true")
    c = sub.add_parser("chat")
    c.add_argument("--farm", required=True)
    c.add_argument("--language")
    s = sub.add_parser("serve")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    config.ensure_dirs()

    if a.cmd == "download-data":
        from agri_advisor.dataset.kaggle_download import download_all
        download_all()
    elif a.cmd == "build-dataset":
        from agri_advisor.dataset.build_hybrid import build
        build(a.seasons_per_crop, seed=a.seed)
    elif a.cmd == "train":
        from agri_advisor.ml.train import train
        train(sample_seasons=a.sample_seasons)
    elif a.cmd == "add-farm":
        from agri_advisor.ingestion.farms import register_farm
        farm = register_farm({"farm_id": a.id, "farmer_name": a.name, "language": a.language, "latitude": a.lat,
                              "longitude": a.lon, "crop": a.crop, "sowing_date": a.sown, "irrigated": a.irrigated,
                              "soil_type": a.soil_type})
        print(f"registered {farm['farm_id']}: {farm['crop']} sown {farm['sowing_date']} in {farm['district']}, {farm['state']}")
    elif a.cmd == "farms":
        for farm in storage.list_farms():
            print(f"{farm['farm_id']:<20} {farm['crop']:<12} sown {farm['sowing_date']}  {farm['district']}, {farm['state']}")
    elif a.cmd == "collect":
        from agri_advisor.ingestion.collector import collect_all, collect_for_farm
        print(json.dumps(collect_for_farm(a.farm) if a.farm else collect_all(), indent=2))
    elif a.cmd == "predict":
        from agri_advisor.ml.inference import run_all, run_inference
        preds = [run_inference(a.farm, collect=not a.no_collect)] if a.farm else run_all(collect=not a.no_collect)
        for p in preds:
            print(f"\n{p['farm_id']} [{p['crop']}] as of {p['as_of_date']}  model {p['model_version']}")
            print(f"  maturity {p['maturity_pct']}%  readiness now {p['readiness_now']}  health {p['health_now']}")
            print(f"  harvest on {p['recommended_harvest_date']}  (window {p['window_start']} -> {p['window_end']})")
            print(f"  expected yield {p['expected_yield_kg_ha']} kg/ha")
            m = p["market"]
            if m.get("available"):
                print(f"  mandi {m['commodity']}: Rs {m['avg_modal_price_rs_qtl']}/qtl across {m['n_markets']} markets ({m['latest_date']})")
            for al in p["alerts"]:
                print(f"  ! [{al['severity']}] {al['type']}: {al['advice']}")
    elif a.cmd == "chat":
        from agri_advisor.advisory.chat import chat
        session = None
        print("Type your question (Ctrl+C to exit).")
        try:
            while True:
                msg = input("\nfarmer> ").strip()
                if msg:
                    r = chat(a.farm, msg, session_id=session, language=a.language)
                    session = r["session_id"]
                    print(f"advisor> {r['reply']}")
        except (KeyboardInterrupt, EOFError):
            print()
    elif a.cmd == "serve":
        import uvicorn
        uvicorn.run("agri_advisor.api.server:app", host=a.host, port=a.port)


if __name__ == "__main__":
    main()
