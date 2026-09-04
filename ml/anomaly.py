"""
ml/anomaly.py — Per-facility FRP anomaly detector

Pipeline
────────
  1. Load hotspots from PostgreSQL (id, facility_id, frp, acq_date)
  2. Compute per-facility rolling FRP baseline (mean + std)
  3. Calculate Z-score for each hotspot vs its facility baseline
  4. Compute a 0–100 anomaly score (z-score + absolute FRP blend)
  5. Write frp_zscore / anomaly_score / is_anomaly back to DB via a single
     batched UPDATE (temp table CTE) — never overwrites risk_score

Two modes
─────────
  memory  : uses labeled.parquet (demo / unit-test)
  db      : queries PostgreSQL, writes results back (production)

Usage
─────
  cd AgniDrishti
  python -m ml.anomaly               # runs db mode (uses DATABASE_URL env)
  python -m ml.anomaly --mode=memory # demo on local parquet
"""
from __future__ import annotations

import math
import os
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

OUTPUT_DIR = Path(__file__).parent / "output"

# Hotspot is anomalous when z-score exceeds this AND facility has enough history
Z_THRESHOLD = 2.5
MIN_HIST    = 3   # minimum observations per facility to compute a meaningful baseline


# ──────────────────────────────────────────────────────────────────────────────
# Core computation  (pure functions — testable without DB)
# ──────────────────────────────────────────────────────────────────────────────

def compute_facility_baseline(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-facility FRP baseline (mean, std, count) and Z-score.

    Parameters
    ----------
    df : DataFrame with columns [facility_id, frp]
         facility_id may be NaN for unlinked hotspots — those get global baseline.

    Returns
    -------
    df with additional columns:
      facility_frp_mean, facility_frp_std, facility_frp_count,
      frp_zscore, anomaly_score, is_anomaly
    """
    df = df.copy()
    df["facility_id"] = pd.to_numeric(df["facility_id"], errors="coerce")
    df["frp"]         = pd.to_numeric(df["frp"],         errors="coerce").fillna(0.0)

    # Global fallback
    global_mean = float(df["frp"].mean() or 0)
    global_std  = float(max(df["frp"].std() or 0, 0.01))

    # Per-facility stats
    linked  = df[df["facility_id"].notna()]
    stats   = (
        linked
        .groupby("facility_id")["frp"]
        .agg(facility_frp_mean="mean", facility_frp_std="std", facility_frp_count="count")
        .reset_index()
    )
    stats["facility_frp_std"] = (
        stats["facility_frp_std"].fillna(global_std).clip(lower=0.01)
    )

    df = df.merge(stats, on="facility_id", how="left")
    df["facility_frp_mean"]  = df["facility_frp_mean"].fillna(global_mean)
    df["facility_frp_std"]   = df["facility_frp_std"].fillna(global_std)
    df["facility_frp_count"] = df["facility_frp_count"].fillna(0).astype(int)

    # Z-score: clipped to [-5, 15]
    df["frp_zscore"] = (
        (df["frp"] - df["facility_frp_mean"]) / df["facility_frp_std"]
    ).clip(-5, 15).fillna(0.0).round(3)

    # Anomaly flag
    df["is_anomaly"] = (
        (df["facility_frp_count"] >= MIN_HIST) &
        (df["frp_zscore"]         >= Z_THRESHOLD)
    )

    # Anomaly score 0–100: 60% z-component + 40% absolute FRP component
    max_frp = max(float(df["frp"].max()), 1.0)
    df["anomaly_score"] = (
        (df["frp_zscore"].clip(0, 10) / 10.0) * 60.0
        + (df["frp"] / max_frp) * 40.0
    ).clip(0, 100).round(1)

    return df


# ──────────────────────────────────────────────────────────────────────────────
# DB I/O
# ──────────────────────────────────────────────────────────────────────────────

def load_from_db(database_url: str) -> pd.DataFrame:
    """Pull hotspots from PostgreSQL."""
    try:
        import psycopg2
    except ImportError:
        raise ImportError("Run: pip install psycopg2-binary")

    conn = psycopg2.connect(database_url)
    df   = pd.read_sql(
        "SELECT id, facility_id, frp, acq_date FROM hotspots ORDER BY id",
        conn,
    )
    conn.close()
    return df


def push_to_db(df: pd.DataFrame, database_url: str) -> int:
    """
    Write frp_zscore / anomaly_score / is_anomaly back to hotspots.

    Uses a single batched UPDATE via a VALUES list — far faster than one
    PATCH request per row. Writes only to the three new columns and never
    touches risk_score (which is owned by the dispatcher).

    Returns the number of rows updated.
    """
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        raise ImportError("Run: pip install psycopg2-binary")

    records = [
        (
            float(row["frp_zscore"]),
            float(row["anomaly_score"]),
            bool(row["is_anomaly"]),
            int(row["id"]),
        )
        for _, row in df.iterrows()
    ]

    conn = psycopg2.connect(database_url)
    cur  = conn.cursor()

    # Batch in chunks of 1000 to avoid huge single statements
    updated = 0
    chunk_sz = 1000
    for i in range(0, len(records), chunk_sz):
        chunk = records[i : i + chunk_sz]
        # Build a temp VALUES table and join-update
        args_str = ",".join(
            cur.mogrify("(%s,%s,%s,%s)", r).decode() for r in chunk
        )
        cur.execute(f"""
            UPDATE hotspots AS h
            SET
                frp_zscore    = v.z,
                anomaly_score = v.a,
                is_anomaly    = v.flag
            FROM (VALUES {args_str})
              AS v(z, a, flag, id)
            WHERE h.id = v.id::int
        """)
        updated += cur.rowcount

    conn.commit()
    conn.close()
    return updated


# ──────────────────────────────────────────────────────────────────────────────
# Public entrypoint used by scheduler / ML pipeline
# ──────────────────────────────────────────────────────────────────────────────

def run(database_url: str | None = None) -> dict:
    """
    Full anomaly pass: load → compute → write back.

    Returns a summary dict for logging.
    """
    db_url = database_url or os.environ.get(
        "DATABASE_URL", "postgresql://sih:sih@localhost:5432/firewatch"
    )

    print("[anomaly] Loading hotspots from DB…")
    df = load_from_db(db_url)
    print(f"[anomaly] {len(df):,} hotspots loaded")

    df = compute_facility_baseline(df)

    n_anomaly = int(df["is_anomaly"].sum())
    pct       = n_anomaly / max(len(df), 1) * 100
    max_z     = float(df["frp_zscore"].max())

    print(f"[anomaly] {n_anomaly:,} anomalies ({pct:.1f}%) | max z-score: {max_z:.2f}")

    updated = push_to_db(df, db_url)
    print(f"[anomaly] Wrote z-scores to {updated:,} rows in DB")

    # Also save parquet snapshot
    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "anomalies.parquet"
    df.to_parquet(out_path, index=False)
    print(f"[anomaly] Snapshot saved → {out_path}")

    return {
        "total":     len(df),
        "anomalies": n_anomaly,
        "pct":       round(pct, 1),
        "max_zscore": round(max_z, 2),
        "db_updated": updated,
    }


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="AgniDrishti anomaly detector")
    p.add_argument("--mode", choices=["memory", "db"], default="db")
    p.add_argument("--db",   default=None, help="Override DATABASE_URL")
    args = p.parse_args()

    print("=== AgniDrishti Anomaly Detector ===\n")

    if args.mode == "memory":
        labeled_path = OUTPUT_DIR / "labeled.parquet"
        if not labeled_path.exists():
            print("No labeled.parquet — run ml/train.py first.")
        else:
            df = pd.read_parquet(labeled_path)
            if "facility_id" not in df.columns:
                rng = np.random.default_rng(42)
                df["facility_id"] = rng.integers(1, 50, size=len(df)).astype(float)
                df.loc[rng.random(len(df)) < 0.15, "facility_id"] = np.nan
            df = compute_facility_baseline(df)
            n = int(df["is_anomaly"].sum())
            print(f"Anomalies: {n:,} / {len(df):,}  ({n/len(df)*100:.1f}%)")
            cols = ["facility_id", "frp", "facility_frp_mean", "frp_zscore", "anomaly_score"]
            top10 = df[df["is_anomaly"]].nlargest(10, "anomaly_score")[cols]
            print("\nTop 10 anomalous hotspots:")
            print(top10.to_string(index=False))
    else:
        summary = run(args.db)
        print(f"\nSummary: {summary}")
