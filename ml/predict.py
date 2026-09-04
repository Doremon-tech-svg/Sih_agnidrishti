"""
ml/predict.py — Batch inference + DB write-back

Loads trained XGB + LGB models, reads the hotspots table (or a local CSV),
runs ensemble prediction, and PATCHes results back via the REST API.

Usage
  cd AgniDrishti
  source backend/venv/bin/activate

  # Predict on local labeled.parquet (demo / CI)
  python -m ml.predict --mode=parquet

  # Predict on live DB hotspots (production)
  python -m ml.predict --mode=db

  # Predict on a specific CSV file
  python -m ml.predict --mode=csv --input data/raw/firms/firms_jamnagar.csv
"""
from __future__ import annotations

import argparse
import json
import urllib.request
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.feature_engineering import load_and_engineer, FEATURE_COLS
from ml.labeler import CLASS_NAMES

warnings.filterwarnings("ignore")

MODEL_DIR  = Path(__file__).parent / "models"
OUTPUT_DIR = Path(__file__).parent / "output"
API_BASE   = "http://localhost:4000/api"


# ──────────────────────────────────────────────────────────────────────────────
# Model loading
# ──────────────────────────────────────────────────────────────────────────────

def load_models() -> tuple:
    """Load XGBoost + LightGBM models and metadata."""
    xgb_path  = MODEL_DIR / "xgb_classifier.joblib"
    lgb_path  = MODEL_DIR / "lgb_classifier.joblib"
    meta_path = MODEL_DIR / "model_meta.json"

    if not xgb_path.exists() or not lgb_path.exists():
        raise FileNotFoundError(
            f"Models not found in {MODEL_DIR}. Run ml/train.py first."
        )

    xgb_model = joblib.load(xgb_path)
    lgb_model  = joblib.load(lgb_path)

    with open(meta_path) as f:
        meta = json.load(f)

    print(f"  Loaded XGB (acc={meta['xgb_accuracy']:.3f}) + "
          f"LGB (acc={meta['lgb_accuracy']:.3f}), "
          f"ensemble acc={meta['ensemble_accuracy']:.3f}")
    return xgb_model, lgb_model, meta


# ──────────────────────────────────────────────────────────────────────────────
# Prediction helpers
# ──────────────────────────────────────────────────────────────────────────────

def predict_dataframe(
    df: pd.DataFrame,
    xgb_model,
    lgb_model,
    w_xgb: float = 0.5,
) -> pd.DataFrame:
    """
    Run ensemble inference on a feature-engineered DataFrame.

    Adds columns:
      predicted_class  int      (0–6)
      predicted_name   str      (class label string)
      class_confidence float    (max ensemble probability)
      risk_score       float    (0–100, derived from class + FRP z-score)
      explanation      str      (human-readable why)
    """
    X = df[FEATURE_COLS].values.astype(np.float32)

    xgb_proba = xgb_model.predict_proba(X)
    lgb_proba  = lgb_model.predict_proba(X)
    ens_proba  = w_xgb * xgb_proba + (1 - w_xgb) * lgb_proba

    pred_class = ens_proba.argmax(axis=1)
    pred_conf  = ens_proba.max(axis=1)

    df = df.copy()
    df["predicted_class"]  = pred_class
    df["predicted_name"]   = [CLASS_NAMES[c] for c in pred_class]
    df["class_confidence"] = pred_conf.round(4)

    # Risk score: blend class weight + FRP z-score + confidence
    CLASS_BASE_RISK = {0: 5, 1: 20, 2: 35, 3: 80, 4: 25, 5: 50, 6: 30}
    base = np.array([CLASS_BASE_RISK[c] for c in pred_class], dtype=float)
    zscore = df.get("facility_frp_zscore", df.get("frp_zscore", pd.Series(np.zeros(len(df)))))
    zscore = pd.to_numeric(zscore, errors="coerce").fillna(0.0).values

    risk = (base * 0.6
            + np.clip(zscore, 0, 10) / 10 * 30
            + pred_conf * 10)
    df["risk_score"] = np.clip(risk, 0, 100).round(1)

    # Explanation
    def _explain(row):
        return (
            f"{row['predicted_name']} ({row['class_confidence']*100:.0f}% confidence). "
            f"FRP={row['frp']:.1f} MW, "
            f"risk={row['risk_score']:.0f}/100."
        )
    df["ml_explanation"] = df.apply(_explain, axis=1)

    return df


# ──────────────────────────────────────────────────────────────────────────────
# DB write-back via REST API
# ──────────────────────────────────────────────────────────────────────────────

def patch_hotspot(hotspot_id: int, payload: dict) -> bool:
    """PATCH /api/hotspots/:id with prediction results. Returns True on success."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API_BASE}/hotspots/{hotspot_id}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception as e:
        print(f"    WARN: PATCH hotspot {hotspot_id} failed: {e}")
        return False


def write_back_to_api(df: pd.DataFrame, id_col: str = "id") -> tuple[int, int]:
    """
    PATCH all rows in df back to the backend REST API.

    Returns (success_count, failure_count).
    """
    ok, fail = 0, 0
    for _, row in df.iterrows():
        hid = int(row.get(id_col, -1))
        if hid < 0:
            continue
        payload = {
            "classification":   row["predicted_name"],
            "class_confidence": float(row["class_confidence"]),
            "risk_score":        float(row["risk_score"]),
            "explanation":       row["ml_explanation"],
        }
        if patch_hotspot(hid, payload):
            ok += 1
        else:
            fail += 1
    return ok, fail


# ──────────────────────────────────────────────────────────────────────────────
# Load sources
# ──────────────────────────────────────────────────────────────────────────────

def load_from_parquet() -> pd.DataFrame:
    p = OUTPUT_DIR / "labeled.parquet"
    if not p.exists():
        raise FileNotFoundError(f"No labeled.parquet found at {p}. Run ml/train.py first.")
    df = pd.read_parquet(p)
    # Add fake id for demo
    if "id" not in df.columns:
        df["id"] = range(1, len(df) + 1)
    return df


def load_from_csv(csv_path: str) -> pd.DataFrame:
    df = load_and_engineer(csv_path=csv_path)
    if "id" not in df.columns:
        df["id"] = range(1, len(df) + 1)
    return df


def load_from_db(database_url: str) -> pd.DataFrame:
    try:
        import psycopg2
        conn = psycopg2.connect(database_url)
        raw = pd.read_sql(
            """SELECT id, lat AS latitude, lon AS longitude,
                      brightness_ti4 AS bright_ti4, frp,
                      confidence, satellite, acq_date,
                      facility_id
               FROM hotspots
               WHERE classification IS NULL
               ORDER BY created_at DESC
               LIMIT 10000""",
            conn,
        )
        conn.close()
    except ImportError:
        raise ImportError("psycopg2 not installed: pip install psycopg2-binary")

    df = load_and_engineer(df_raw=raw)
    return df


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AgniDrishti ML Predictor")
    parser.add_argument("--mode", choices=["parquet", "csv", "db"], default="parquet")
    parser.add_argument("--input", default=None, help="CSV path for --mode=csv")
    parser.add_argument("--db-url", default="postgresql://sih:sih@localhost:5432/firewatch")
    parser.add_argument("--write-back", action="store_true",
                        help="PATCH results to REST API")
    args = parser.parse_args()

    print("\n" + "="*60)
    print("  AgniDrishti ML — Batch Inference")
    print("="*60)

    print("\n[1/3] Loading models …")
    xgb_model, lgb_model, meta = load_models()

    print(f"\n[2/3] Loading hotspots (mode={args.mode}) …")
    if args.mode == "parquet":
        df = load_from_parquet()
    elif args.mode == "csv":
        if not args.input:
            raise ValueError("--input required for --mode=csv")
        df = load_from_csv(args.input)
    else:
        df = load_from_db(args.db_url)

    print(f"  Rows to predict: {len(df):,}")

    print("\n[3/3] Running ensemble inference …")
    df = predict_dataframe(df, xgb_model, lgb_model)

    dist = df["predicted_class"].value_counts().sort_index()
    print("\n  Prediction distribution:")
    for cls_id, cnt in dist.items():
        print(f"    {cls_id} {CLASS_NAMES[cls_id]:<30} {cnt:>5}")

    # Save predictions
    out = OUTPUT_DIR / "predictions.parquet"
    df.to_parquet(out, index=False)
    print(f"\n  Saved → {out}")

    # Optional write-back
    if args.write_back:
        print("\n  Writing back to REST API …")
        ok, fail = write_back_to_api(df)
        print(f"  Updated: {ok} hotspots | Failed: {fail}")
    else:
        print("\n  (Use --write-back to PATCH results to the backend API)")

    print(f"\n{'='*60}\n  Done.\n{'='*60}\n")


if __name__ == "__main__":
    main()
