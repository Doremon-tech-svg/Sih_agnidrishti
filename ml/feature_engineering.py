"""
ml/feature_engineering.py
──────────────────────────────────────────────────────────────────────────────
Loads the raw FIRMS CSVs, computes all features needed for classification.

Features produced
─────────────────
Sensor / radiometric
  frp, brightness_ti4, brightness_ti5, scan, track, frp_per_scan_area

Temporal
  hour_utc, month, day_of_year, is_night (daynight == 'N')

Land-cover encoding  (from `cluster` + region heuristics when raster unavailable)
  lc_industrial, lc_cropland, lc_forest, lc_urban, lc_other

Facility / context (proximity encoded from known cluster centres)
  dist_to_nearest_cluster_km
  cluster_id  (0=jamnagar, 1=vadodara, 2=bharuch, 3=surat)

Confidence encoding
  conf_low, conf_nominal, conf_high   (nominal / n / l / h)

Per-facility FRP baseline (computed over all detections at the same lat/lon
rounded to 0.05°, i.e. ~5km grid cell)
  frp_cell_mean, frp_cell_std, frp_cell_count, frp_zscore

All features are numeric and safe for XGBoost / LightGBM (no NaN—filled with
sensible defaults).
"""

from __future__ import annotations

import math
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "firms"

# Approximate centres of the 4 clusters (lat, lon)
CLUSTER_CENTRES = {
    "jamnagar":  (22.40, 70.05),
    "vadodara":  (22.28, 73.20),
    "bharuch":   (21.70, 73.03),
    "surat":     (21.18, 72.90),
}

CLUSTER_ID = {k: i for i, k in enumerate(CLUSTER_CENTRES)}

# WorldCover ESA class codes → broad category
LC_INDUSTRIAL_CODES = {50}          # Built-up (proxy for industrial)
LC_CROPLAND_CODES   = {40}          # Cropland
LC_FOREST_CODES     = {10, 20, 30}  # Tree cover, shrubland, grassland
LC_WETLAND_CODES    = {90, 95}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in kilometres."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _nearest_cluster(lat: float, lon: float) -> tuple[str, float]:
    """Return (cluster_name, distance_km) for the nearest cluster centre."""
    best_name, best_dist = "", float("inf")
    for name, (clat, clon) in CLUSTER_CENTRES.items():
        d = _haversine(lat, lon, clat, clon)
        if d < best_dist:
            best_dist, best_name = d, name
    return best_name, best_dist


def _encode_confidence(conf: str) -> tuple[int, int, int]:
    """Return (low, nominal, high) one-hot from VIIRS confidence string."""
    c = str(conf).strip().lower()
    if c in ("l", "low"):
        return 1, 0, 0
    if c in ("h", "high"):
        return 0, 0, 1
    return 0, 1, 0  # nominal / n / unknown


# ──────────────────────────────────────────────────────────────────────────────
# FRP baseline (per ~5km grid cell)
# ──────────────────────────────────────────────────────────────────────────────

def _compute_frp_baseline(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each 0.05° grid cell (lat_cell, lon_cell), compute:
      frp_cell_mean, frp_cell_std, frp_cell_count, frp_zscore

    This is a fast approximation of a per-facility FRP baseline.
    """
    df = df.copy()
    df["lat_cell"] = (df["latitude"] / 0.05).round() * 0.05
    df["lon_cell"] = (df["longitude"] / 0.05).round() * 0.05

    stats = (
        df.groupby(["lat_cell", "lon_cell"])["frp"]
        .agg(frp_cell_mean="mean", frp_cell_std="std", frp_cell_count="count")
        .reset_index()
    )

    df = df.merge(stats, on=["lat_cell", "lon_cell"], how="left")

    # Std may be NaN for single-observation cells → default to 1 (no spike)
    df["frp_cell_std"] = df["frp_cell_std"].fillna(1.0).clip(lower=0.01)

    df["frp_zscore"] = (
        (df["frp"] - df["frp_cell_mean"]) / df["frp_cell_std"]
    ).clip(-5, 15).fillna(0.0)

    df.drop(columns=["lat_cell", "lon_cell"], inplace=True)
    return df


# ──────────────────────────────────────────────────────────────────────────────
# Landcover features  (cluster-level heuristic when raster not available)
# ──────────────────────────────────────────────────────────────────────────────

# Gujarat industrial belt → mostly industrial/urban; surat has some cropland
_CLUSTER_LC_DEFAULTS = {
    "jamnagar": (1, 0, 0, 0),   # (industrial, cropland, forest, urban)
    "vadodara": (1, 0, 0, 0),
    "bharuch":  (1, 0, 0, 0),
    "surat":    (0, 1, 0, 1),   # mixed
}


def _lc_features_from_cluster(cluster: str) -> dict:
    ind, crop, forest, urban = _CLUSTER_LC_DEFAULTS.get(
        str(cluster).lower(), (0, 0, 0, 0)
    )
    return {
        "lc_industrial": ind,
        "lc_cropland":   crop,
        "lc_forest":     forest,
        "lc_urban":      urban,
    }


def _lc_features_from_code(code: int) -> dict:
    return {
        "lc_industrial": int(code in LC_INDUSTRIAL_CODES),
        "lc_cropland":   int(code in LC_CROPLAND_CODES),
        "lc_forest":     int(code in LC_FOREST_CODES),
        "lc_urban":      int(code == 50),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Main feature builder
# ──────────────────────────────────────────────────────────────────────────────

FEATURE_COLS = [
    # Radiometric
    "frp", "brightness_ti4", "brightness_ti5",
    "scan", "track", "frp_per_scan_area",
    # Temporal
    "hour_utc", "month", "day_of_year", "is_night",
    # Confidence
    "conf_low", "conf_nominal", "conf_high",
    # Land cover
    "lc_industrial", "lc_cropland", "lc_forest", "lc_urban",
    # Cluster / spatial
    "cluster_id", "dist_to_cluster_km",
    # FRP baseline
    "frp_cell_mean", "frp_cell_std", "frp_cell_count", "frp_zscore",
]


def load_and_engineer(
    csv_path: str | Path | None = None,
    df_raw: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    Load raw FIRMS CSV (or accept an already-loaded DataFrame) and return a
    fully-featured DataFrame with a ``label`` column if labeling has been run.

    Parameters
    ----------
    csv_path : path to a FIRMS CSV (optional if df_raw supplied)
    df_raw   : pre-loaded raw DataFrame (optional if csv_path supplied)

    Returns
    -------
    pd.DataFrame with all FEATURE_COLS plus metadata columns.
    """
    # ── 1. Load ──────────────────────────────────────────────────────────────
    if df_raw is not None:
        df = df_raw.copy()
    elif csv_path is not None:
        df = pd.read_csv(csv_path)
    else:
        raise ValueError("Provide csv_path or df_raw.")

    df.columns = [c.strip().lower() for c in df.columns]

    # ── 2. Ensure numeric core fields ────────────────────────────────────────
    for col in ["frp", "bright_ti4", "bright_ti5", "scan", "track", "latitude", "longitude"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["frp"]          = df["frp"].fillna(0.0)
    df["brightness_ti4"] = df.get("bright_ti4", pd.Series(dtype=float)).fillna(300.0)
    df["brightness_ti5"] = df.get("bright_ti5", pd.Series(dtype=float)).fillna(280.0)
    df["scan"]         = df.get("scan", pd.Series(dtype=float)).fillna(0.4)
    df["track"]        = df.get("track", pd.Series(dtype=float)).fillna(0.4)

    # ── 3. Temporal features ─────────────────────────────────────────────────
    if "acq_date" in df.columns:
        df["acq_date"] = pd.to_datetime(df["acq_date"], errors="coerce")
        df["month"]       = df["acq_date"].dt.month.fillna(1).astype(int)
        df["day_of_year"] = df["acq_date"].dt.day_of_year.fillna(1).astype(int)
    else:
        df["month"]       = 1
        df["day_of_year"] = 1

    if "acq_time" in df.columns:
        df["acq_time"] = pd.to_numeric(df["acq_time"], errors="coerce").fillna(0)
        df["hour_utc"] = (df["acq_time"] // 100).astype(int)
    else:
        df["hour_utc"] = 0

    df["is_night"] = (
        df.get("daynight", pd.Series(["N"] * len(df)))
        .fillna("N")
        .str.upper()
        .eq("N")
        .astype(int)
    )

    # ── 4. Confidence ────────────────────────────────────────────────────────
    conf_encoded = df.get("confidence", pd.Series(["n"] * len(df))).apply(
        lambda c: pd.Series(dict(zip(
            ["conf_low", "conf_nominal", "conf_high"],
            _encode_confidence(c)
        )))
    )
    df = pd.concat([df, conf_encoded], axis=1)

    # ── 5. Cluster / spatial ─────────────────────────────────────────────────
    if "cluster" in df.columns:
        df["cluster_id"] = df["cluster"].map(CLUSTER_ID).fillna(-1).astype(int)
        lc_df = df["cluster"].apply(
            lambda c: pd.Series(_lc_features_from_cluster(c))
        )
        df = pd.concat([df, lc_df], axis=1)
    else:
        df["cluster_id"] = -1
        for col in ["lc_industrial", "lc_cropland", "lc_forest", "lc_urban"]:
            df[col] = 0

    nearest = df.apply(
        lambda r: pd.Series(
            _nearest_cluster(r["latitude"], r["longitude"]),
            index=["nearest_cluster", "dist_to_cluster_km"],
        ),
        axis=1,
    )
    df["dist_to_cluster_km"] = nearest["dist_to_cluster_km"]

    # ── 6. Derived radiometric ───────────────────────────────────────────────
    scan_area = df["scan"] * df["track"]
    df["frp_per_scan_area"] = (df["frp"] / scan_area.clip(lower=0.01)).clip(upper=500)

    # ── 7. Per-cell FRP baseline ─────────────────────────────────────────────
    df = _compute_frp_baseline(df)

    # ── 8. Final fill & clip ─────────────────────────────────────────────────
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    return df


def load_all_clusters(data_dir: str | Path = DATA_DIR) -> pd.DataFrame:
    """Load and engineer features from all cluster CSVs in data_dir."""
    data_dir = Path(data_dir)
    frames = []
    for csv_file in sorted(data_dir.glob("firms_*.csv")):
        print(f"  Loading {csv_file.name} …")
        df = load_and_engineer(csv_path=csv_file)
        df["source_file"] = csv_file.name
        frames.append(df)
    if not frames:
        raise FileNotFoundError(f"No firms_*.csv files found in {data_dir}")
    combined = pd.concat(frames, ignore_index=True)
    print(f"  Total rows: {len(combined):,}")
    return combined


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== Feature Engineering ===")
    df = load_all_clusters()
    print(df[FEATURE_COLS].describe().to_string())
    out = Path(__file__).parent / "output" / "features.parquet"
    out.parent.mkdir(exist_ok=True)
    df.to_parquet(out, index=False)
    print(f"\nSaved → {out}")
