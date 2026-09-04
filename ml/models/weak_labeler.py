""""
Weak supervision labeler for AgniDrishti fire event type classification.
Uses rule-based heuristics to assign one of 7 classes.
"""

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

# Thresholds (adjust as needed)
FRP_NOISE = 0.8
FRP_LOW = 4.0
FRP_MODERATE = 20.0
FRP_HIGH = 80.0
Z_SPIKE = 2.0
Z_STABLE = 0.8
AGRI_MONTHS = {9, 10, 11, 12, 1, 2, 3}
FLARE_MIN_COUNT = 2


def label_row(row):
    frp = float(row.get("frp", 0.0))
    zscore = float(row.get("frp_zscore", 0.0))
    is_night = int(row.get("is_night", 0))
    month = int(row.get("acquisition_month", 6))
    conf_low = float(row.get("confidence_score", 0.5)) < 0.4
    conf_high = float(row.get("confidence_score", 0.5)) >= 0.8
    lc_ind = int(row.get("is_built_up", 0))
    lc_crop = int(row.get("is_cropland", 0))
    lc_veg = int(row.get("is_vegetation", 0))
    dist_km = float(row.get("nearest_industrial_distance_m", 5000.0)) / 1000.0
    cell_count = int(row.get("powerplant_count", 1))
    cluster_id = int(row.get("cluster_density", 0))

    near_cluster = dist_km < 20.0

    if frp < FRP_NOISE:
        return 0, 0.9, f"FRP={frp:.2f} MW below noise floor"
    if conf_low and frp < 2.0:
        return 0, 0.82, f"Low-confidence ({frp:.1f} MW)"

    if near_cluster and zscore >= Z_SPIKE and frp >= FRP_MODERATE:
        conf = min(0.95, 0.73 + (zscore - Z_SPIKE) * 0.04)
        return 3, conf, f"FRP anomaly {frp:.1f} MW (z={zscore:.1f}) near industrial area"

    is_jamnagar = cluster_id == 0

    if ((is_night or is_jamnagar) and near_cluster and frp >= FRP_LOW and abs(zscore) < Z_SPIKE and cell_count >= FLARE_MIN_COUNT):
        conf = 0.82 if is_jamnagar else 0.68
        return 1, conf, "Night/daytime flare pattern"

    if lc_ind and dist_km > 3.5 and FRP_LOW <= frp <= FRP_HIGH:
        return 6, 0.62, f"Isolated industrial thermal ({frp:.1f} MW, {dist_km:.0f} km)"

    if lc_crop and month in AGRI_MONTHS:
        return 4, 0.75 if frp < FRP_MODERATE else 0.58, "Cropland + harvest season"

    if lc_veg and not lc_ind and frp >= FRP_LOW:
        return 5, 0.72 if frp > FRP_MODERATE else 0.55, "Vegetation and moderate/high FRP"

    if near_cluster and frp >= FRP_LOW:
        return 2, 0.60 if cell_count < 4 else 0.78, "Near-cluster industrial heat"

    if month in AGRI_MONTHS and frp >= FRP_LOW:
        return 4, 0.50, "Rural detection in harvest month"

    if frp >= FRP_MODERATE:
        return 2, 0.45, "Moderate unclassified thermal"

    return 4, 0.40, "Weak unclassified thermal"


def label_dataframe(df):
    """Add label, label_name, label_conf, explanation columns."""
    results = df.apply(label_row, axis=1, result_type="expand")
    results.columns = ["label", "label_conf", "explanation"]
    df = df.copy()
    df["label"] = results["label"].astype(int)
    df["label_name"] = df["label"].map(CLASS_NAMES)
    df["label_conf"] = results["label_conf"]
    df["explanation"] = results["explanation"]
    return df