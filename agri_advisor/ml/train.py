"""Train the harvest model on the hybrid dataset and save it to models/harvest_model.joblib."""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

from .. import config
from ..agronomy import MODEL_COLUMNS, NUMERIC_FEATURES, TARGETS, to_model_matrix
from .model import build_model


def load_dataset(path: Path | None = None, sample_seasons: int | None = None, seed: int = 0) -> pd.DataFrame:
    path = Path(path or config.DATASET_PATH)
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Run: python main.py build-dataset")
    df = pd.read_csv(path)
    if sample_seasons:
        keep = np.random.default_rng(seed).choice(df["season_id"].unique(), sample_seasons, replace=False)
        df = df[df["season_id"].isin(keep)]
    return df


def evaluate(Y_true: pd.DataFrame, Y_pred: np.ndarray, crops: pd.Series) -> dict:
    Y_pred = np.asarray(Y_pred)
    metrics = {t: {"mae": float(mean_absolute_error(Y_true[t], Y_pred[:, i])),
                   "r2": float(r2_score(Y_true[t], Y_pred[:, i]))} for i, t in enumerate(TARGETS)}
    dth_err = np.abs(Y_true["days_to_harvest"].to_numpy() - Y_pred[:, 0])
    metrics["days_to_harvest_mae_by_crop"] = pd.Series(dth_err).groupby(crops.to_numpy()).mean().round(2).to_dict()
    return metrics


def train(dataset_path: Path | None = None, model_path: Path | None = None, test_frac: float = 0.2,
          sample_seasons: int | None = None, seed: int = 42) -> dict:
    df = load_dataset(dataset_path, sample_seasons, seed)
    train_idx, test_idx = next(GroupShuffleSplit(n_splits=1, test_size=test_frac, random_state=seed)
                               .split(df, groups=df["season_id"]))
    tr, te = df.iloc[train_idx], df.iloc[test_idx]
    X_tr, X_te = to_model_matrix(tr)[MODEL_COLUMNS], to_model_matrix(te)[MODEL_COLUMNS]
    print(f"Train rows {len(tr):,} ({tr['season_id'].nunique()} seasons) | test rows {len(te):,} "
          f"({te['season_id'].nunique()} seasons) | {len(MODEL_COLUMNS)} features")

    model = build_model()
    model.fit(X_tr, tr[TARGETS])
    pred = np.asarray(model.predict(X_te))
    if pred.shape != (len(te), len(TARGETS)):
        raise ValueError(f"model.predict returned shape {pred.shape}, expected {(len(te), len(TARGETS))}")

    metrics = evaluate(te[TARGETS], pred, te["crop"])
    for t in TARGETS:
        print(f"  {t:<22} MAE {metrics[t]['mae']:9.3f}   R2 {metrics[t]['r2']:.3f}")

    bundle = {
        "model": model, "model_columns": MODEL_COLUMNS, "targets": TARGETS, "metrics": metrics,
        "version": datetime.now().strftime("%Y%m%d-%H%M%S"), "dataset": str(dataset_path or config.DATASET_PATH),
        "n_train_rows": len(tr),
        # 1st-99th percentile of every numeric feature: inference warns when live API data falls outside
        "feature_ranges": {c: (float(tr[c].quantile(0.01)), float(tr[c].quantile(0.99))) for c in NUMERIC_FEATURES},
    }
    out = Path(model_path or config.MODEL_PATH)
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out)
    print(f"Saved model -> {out}")
    return bundle


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset")
    ap.add_argument("--out")
    ap.add_argument("--sample-seasons", type=int, help="train on a random subset of seasons (quick experiments)")
    a = ap.parse_args()
    train(a.dataset, a.out, sample_seasons=a.sample_seasons)
