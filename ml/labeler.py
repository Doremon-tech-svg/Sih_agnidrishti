"""
ml/labeler.py — Rule-based weak supervision labeler (7 classes)

FP-reduction strategy
─────────────────────
Only label something FP when it truly lacks signal:
  • Satellite confidence = 'l' AND FRP < 2 MW  (definitive noise)
  • OR FRP < 0.8 MW  (below sensor sensitivity)

Anything else gets assigned the most likely real class.
The old "fallback → FP" is gone; instead the fallback is
"Agricultural Burning" (month-sensitive) or "Industrial Thermal Source".
"""
from __future__ import annotations
import pandas as pd

CLASS_NAMES = {
    0: "False Positive",
    1: "Gas Flare",
    2: "Industrial Thermal Source",
    3: "Industrial Fire / Accident",
    4: "Agricultural Burning",
    5: "Wildfire / Forest Fire",
    6: "Mining Thermal Activity",
}

# FRP thresholds (MW)
FRP_NOISE    = 0.8    # below this → always FP
FRP_LOW      = 4.0
FRP_MODERATE = 20.0
FRP_HIGH     = 80.0

# Z-score thresholds
Z_SPIKE  = 2.0
Z_STABLE = 0.8

# Agricultural seasons (Gujarat)
AGRI_MONTHS = {9, 10, 11, 12, 1, 2, 3}

# Near cluster threshold — Gujarat is ~350 km wide; cover it all
NEAR_KM = 200   # widened from 50 to 200 km so rural Gujarat is covered

# Gas flare persistence
FLARE_MIN_COUNT = 2


def label_row(row: pd.Series) -> tuple[int, float, str]:
    """Return (class_int, confidence_0_1, explanation)."""
    frp         = float(row.get("frp", 0.0))
    zscore      = float(row.get("frp_zscore", 0.0))
    is_night    = bool(row.get("is_night", 0))
    month       = int(row.get("month", 6))
    conf_low    = bool(row.get("conf_low", 0))
    conf_high   = bool(row.get("conf_high", 0))
    lc_ind      = bool(row.get("lc_industrial", 0))
    lc_crop     = bool(row.get("lc_cropland", 0))
    lc_forest   = bool(row.get("lc_forest", 0))
    dist_km     = float(row.get("dist_to_cluster_km", 999.0))
    cell_count  = int(row.get("frp_cell_count", 1))
    cluster_id  = int(row.get("cluster_id", -1))

    near_cluster = dist_km < NEAR_KM

    # ── True sensor noise (the ONLY real FP cases) ────────────────────────────
    if frp < FRP_NOISE:
        return 0, 0.90, f"FRP={frp:.2f} MW below noise floor — sensor artifact."
    if conf_low and frp < 2.0:
        return 0, 0.82, f"Low-confidence ({frp:.1f} MW) — likely sensor artifact."

    # ── Industrial Fire / Accident  (high-priority, check early) ─────────────
    if near_cluster and zscore >= Z_SPIKE and frp >= FRP_MODERATE:
        conf = min(0.95, 0.73 + (zscore - Z_SPIKE) * 0.04)
        return 3, conf, (
            f"FRP anomaly {frp:.1f} MW (z={zscore:.1f} ≥ {Z_SPIKE}), "
            "near industrial cluster — Industrial Fire / Accident."
        )

    # ── Gas Flare ─────────────────────────────────────────────────────────────
    is_jamnagar = (cluster_id == 0)
    if ((is_night or is_jamnagar) and near_cluster
            and frp >= FRP_LOW and abs(zscore) < Z_SPIKE
            and cell_count >= FLARE_MIN_COUNT):
        conf = 0.82 if is_jamnagar else 0.68
        return 1, conf, (
            f"{'Night' if is_night else 'Daytime Jamnagar'} detection "
            f"FRP={frp:.1f} MW, z={zscore:.1f}, {cell_count} obs — Gas Flare."
        )

    # ── Mining Thermal Activity ───────────────────────────────────────────────
    if lc_ind and dist_km > 35 and FRP_LOW <= frp <= FRP_HIGH:
        return 6, 0.62, (
            f"Isolated industrial thermal ({frp:.1f} MW, {dist_km:.0f} km from cluster) "
            "— Mining Thermal Activity."
        )

    # ── Agricultural Burning ──────────────────────────────────────────────────
    if lc_crop and month in AGRI_MONTHS:
        return 4, 0.75 if frp < FRP_MODERATE else 0.58, (
            f"Cropland, harvest month {month}, FRP={frp:.1f} MW — Agricultural Burning."
        )

    # ── Wildfire / Forest Fire ────────────────────────────────────────────────
    if lc_forest and not lc_ind and frp >= FRP_LOW:
        return 5, 0.72 if frp > FRP_MODERATE else 0.55, (
            f"Forest land cover, FRP={frp:.1f} MW — Wildfire / Forest Fire."
        )

    # ── Industrial Thermal Source (persistent facility heat) ─────────────────
    if near_cluster and frp >= FRP_LOW:
        conf = 0.60 if cell_count < 4 else 0.78
        return 2, conf, (
            f"Near-cluster industrial heat, FRP={frp:.1f} MW, "
            f"{cell_count} obs, z={zscore:.1f} — Industrial Thermal Source."
        )

    # ── Agricultural Burning fallback (seasonal residue burning) ─────────────
    # Better than FP for any moderate-signal Gujarat rural detection
    if month in AGRI_MONTHS and frp >= FRP_LOW:
        return 4, 0.50, (
            f"Rural detection in harvest month {month}, FRP={frp:.1f} MW — "
            "likely Agricultural Burning."
        )

    # ── Industrial Thermal Source fallback for moderate signal anywhere ───────
    if frp >= FRP_MODERATE:
        return 2, 0.45, (
            f"Moderate unclassified thermal ({frp:.1f} MW) — "
            "likely Industrial Thermal Source."
        )

    # ── True fallback (only reached by very weak, non-noisy detections) ──────
    return 4, 0.40, (
        f"Weak unclassified thermal (FRP={frp:.1f} MW, z={zscore:.1f}) — "
        "probable field burning."
    )


def label_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Add label, label_name, label_conf, explanation columns."""
    results = df.apply(label_row, axis=1, result_type="expand")
    results.columns = ["label", "label_conf", "explanation"]
    df = df.copy()
    df["label"]       = results["label"].astype(int)
    df["label_name"]  = df["label"].map(CLASS_NAMES)
    df["label_conf"]  = results["label_conf"]
    df["explanation"] = results["explanation"]
    return df


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from ml.feature_engineering import load_all_clusters

    print("=== Weak Supervision Labeling ===")
    df = load_all_clusters()
    df = label_dataframe(df)
    dist = df["label"].value_counts().sort_index()
    print("\nLabel distribution:")
    for cls_id, count in dist.items():
        pct = count / len(df) * 100
        print(f"  {cls_id} — {CLASS_NAMES[cls_id]:<30} {count:>5}  ({pct:.1f}%)")
    out = Path(__file__).parent / "output" / "labeled.parquet"
    out.parent.mkdir(exist_ok=True)
    df.to_parquet(out, index=False)
    print(f"\nSaved → {out}")
