"""
ml/train.py — XGBoost + LightGBM ensemble trainer

Pipeline
  1. Load all FIRMS CSVs → feature_engineering.py
  2. Weak-supervision label → labeler.py
  3. Stratified 80/20 train-test split
  4. Train XGBoost + LightGBM classifiers
  5. Ensemble (soft vote / average probabilities)
  6. Evaluate: accuracy, per-class precision/recall/F1
  7. Save models to ml/models/
 
Usage
  cd AgniDrishti
  source backend/venv/bin/activate
  python -m ml.train
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
import lightgbm as lgb

from ml.feature_engineering import load_all_clusters, FEATURE_COLS
from ml.labeler import label_dataframe, CLASS_NAMES

warnings.filterwarnings("ignore")

MODEL_DIR  = Path(__file__).parent / "models"
OUTPUT_DIR = Path(__file__).parent / "output"
MODEL_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# ──────────────────────────────────────────────────────────────────────────────
# Hyper-parameters  (conservative / fast defaults for SIH demo)
# ──────────────────────────────────────────────────────────────────────────────

XGB_PARAMS = dict(
    objective        = "multi:softprob",
    num_class        = 7,
    n_estimators     = 400,
    max_depth        = 6,
    learning_rate    = 0.08,
    subsample        = 0.8,
    colsample_bytree = 0.8,
    min_child_weight = 3,
    gamma            = 0.1,
    reg_alpha        = 0.1,
    reg_lambda       = 1.0,
    random_state     = 42,
    n_jobs           = -1,
    verbosity        = 0,
    eval_metric      = "mlogloss",
)

LGB_PARAMS = dict(
    objective        = "multiclass",
    num_class        = 7,
    n_estimators     = 400,
    max_depth        = 6,
    learning_rate    = 0.08,
    subsample        = 0.8,
    colsample_bytree = 0.8,
    min_child_samples= 10,
    reg_alpha        = 0.1,
    reg_lambda       = 1.0,
    random_state     = 42,
    n_jobs           = -1,
    verbosity        = -1,
)


# ──────────────────────────────────────────────────────────────────────────────
# Training helpers
# ──────────────────────────────────────────────────────────────────────────────

def _print_report(y_true, y_pred, title=""):
    acc = accuracy_score(y_true, y_pred)
    labels = list(range(7))
    names = [CLASS_NAMES[i] for i in labels]
    report = classification_report(
        y_true, y_pred,
        labels=labels,
        target_names=names,
        zero_division=0,
        digits=3,
    )
    print(f"\n{'─'*60}")
    if title:
        print(f"  {title}")
    print(f"  Accuracy: {acc:.4f} ({acc*100:.2f}%)")
    print(f"{'─'*60}")
    print(report)
    return acc


def _soft_ensemble(proba_xgb: np.ndarray, proba_lgb: np.ndarray,
                   w_xgb: float = 0.5) -> np.ndarray:
    """Weighted average of probability matrices."""
    return w_xgb * proba_xgb + (1 - w_xgb) * proba_lgb


# ──────────────────────────────────────────────────────────────────────────────
# Main training function
# ──────────────────────────────────────────────────────────────────────────────

def train(data_dir: str | Path | None = None) -> dict:
    """
    Full training pipeline.

    Returns
    -------
    dict with keys: xgb_model, lgb_model, accuracy_test, report_path
    """
    print("\n" + "="*60)
    print("  AgniDrishti ML — Training Pipeline")
    print("="*60)

    # ── 1. Load & engineer features ──────────────────────────────────────────
    print("\n[1/5] Loading FIRMS data and engineering features …")
    df = load_all_clusters(data_dir) if data_dir else load_all_clusters()

    # ── 2. Label ─────────────────────────────────────────────────────────────
    print("[2/5] Applying weak-supervision labels …")
    df = label_dataframe(df)

    dist = df["label"].value_counts().sort_index()
    print("      Label distribution:")
    for cls_id, cnt in dist.items():
        print(f"        {cls_id} {CLASS_NAMES[cls_id]:<30} {cnt:>5}")

    # ── 3. Prepare X, y ──────────────────────────────────────────────────────
    X = df[FEATURE_COLS].values.astype(np.float32)
    y = df["label"].values.astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )
    print(f"\n[3/5] Split: train={len(X_train):,}  test={len(X_test):,}")

    # ── 4. Train XGBoost ─────────────────────────────────────────────────────
    print("\n[4/5] Training XGBoost …")
    xgb_model = xgb.XGBClassifier(**XGB_PARAMS)
    xgb_model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    xgb_pred  = xgb_model.predict(X_test)
    xgb_proba = xgb_model.predict_proba(X_test)
    xgb_acc   = _print_report(y_test, xgb_pred, "XGBoost")

    print("\n[4b/5] Training LightGBM …")
    lgb_model = lgb.LGBMClassifier(**LGB_PARAMS)
    lgb_model.fit(X_train, y_train)
    lgb_pred  = lgb_model.predict(X_test)
    lgb_proba = lgb_model.predict_proba(X_test)
    lgb_acc   = _print_report(y_test, lgb_pred, "LightGBM")

    # ── 5. Ensemble evaluation ───────────────────────────────────────────────
    ens_proba = _soft_ensemble(xgb_proba, lgb_proba)
    ens_pred  = ens_proba.argmax(axis=1)
    ens_acc   = _print_report(y_test, ens_pred, "Ensemble (XGB 50% + LGB 50%)")

    # ── 6. Save models ───────────────────────────────────────────────────────
    print(f"\n[5/5] Saving models to {MODEL_DIR} …")
    xgb_path = MODEL_DIR / "xgb_classifier.joblib"
    lgb_path = MODEL_DIR / "lgb_classifier.joblib"
    joblib.dump(xgb_model, xgb_path)
    joblib.dump(lgb_model, lgb_path)
    print(f"  Saved: {xgb_path.name}, {lgb_path.name}")

    # Save feature column list (needed by predict.py)
    meta = {
        "feature_cols": FEATURE_COLS,
        "class_names": CLASS_NAMES,
        "xgb_accuracy": round(float(xgb_acc), 4),
        "lgb_accuracy": round(float(lgb_acc), 4),
        "ensemble_accuracy": round(float(ens_acc), 4),
        "n_train": int(len(X_train)),
        "n_test":  int(len(X_test)),
    }
    meta_path = MODEL_DIR / "model_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Saved: {meta_path.name}")

    # Save labeled dataset for audit
    labeled_path = OUTPUT_DIR / "labeled.parquet"
    df.to_parquet(labeled_path, index=False)
    print(f"  Saved: {labeled_path}")

    print(f"\n{'='*60}")
    print(f"  Ensemble accuracy: {ens_acc*100:.2f}%")
    print(f"{'='*60}\n")

    return {
        "xgb_model": xgb_model,
        "lgb_model": lgb_model,
        "ensemble_accuracy": ens_acc,
        "meta_path": str(meta_path),
    }


if __name__ == "__main__":
    train()
