"""Download the public Kaggle datasets that feed the hybrid training set.

Public datasets download anonymously through kagglehub. If Kaggle ever asks for auth, create an API
token at kaggle.com -> Settings -> API and put it in ~/.kaggle/kaggle.json.
"""
import shutil
from pathlib import Path

import kagglehub

from .. import config

# key -> (kaggle slug, file we use, what it contributes)
DATASETS = {
    "crop_recommendation": ("atharvaingle/crop-recommendation-dataset", "Crop_recommendation.csv",
                            "soil N/pH + temperature/humidity profile per crop"),
    "fertilizer": ("gdabhishek/fertilizer-prediction", "Fertilizer Prediction.csv",
                   "soil type + soil moisture distribution per crop"),
    "crop_production": ("abhinand05/crop-production-in-india", "crop_production.csv",
                        "where each crop is grown (state/district) + state-level base yield"),
    "rainfall": ("rajanand/rainfall-in-india", "district wise rainfall normal.csv",
                 "district monthly rainfall normals used to simulate daily rain"),
}


def raw_path(key: str) -> Path:
    return config.RAW_DIR / key / DATASETS[key][1]


def download_all(force: bool = False) -> dict[str, Path]:
    config.ensure_dirs()
    paths = {}
    for key, (slug, filename, why) in DATASETS.items():
        target = raw_path(key)
        if target.exists() and not force:
            print(f"[skip] {key}: {target}")
        else:
            print(f"[download] {slug}  ({why})")
            cached = Path(kagglehub.dataset_download(slug, force_download=force))
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cached / filename, target)
        paths[key] = target
    return paths


if __name__ == "__main__":
    download_all()
