import sys
import json
from pathlib import Path
from datetime import datetime, date
from scipy.spatial import cKDTree
import pandas as pd
import numpy as np
import joblib

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.config import (
    FIRMS_DIR, NIGHTFIRE_FILE, LANDCOVER_DIR, OSM_ROADS_GEOJSON,
    POWERPLANTS_FILE, WORLDPOP_FILE, OUTPUT_DIR, MODEL_DIR, API_BASE
)
from ml.ingestion.integration.firms_unified import FIRMSUnifiedPipeline
from ml.features.engineer import FireFeatureEngineer
from ml.risk.engine import RiskEngine
from ml.agents.detector import run as detector_run
from ml.agents.skeptic import run as skeptic_run
from ml.agents.dispatcher import run as dispatcher_run
from ml.api.client import get_unprocessed_hotspots, patch_hotspot, post_incident

STATUS_FILE = OUTPUT_DIR / "last_run.json"


def load_classifier():
    """
    Load trained XGBoost and LightGBM models if available.
    Returns (xgb_model, lgb_model, meta) or (None, None, None).
    """
    xgb_path = MODEL_DIR / "xgb_classifier.joblib"
    lgb_path = MODEL_DIR / "lgb_classifier.joblib"
    meta_path = MODEL_DIR / "classifier_meta.json"
    if not xgb_path.exists() or not lgb_path.exists():
        return None, None, None
    xgb_model = joblib.load(xgb_path)
    lgb_model = joblib.load(lgb_path)
    with open(meta_path) as f:
        meta = json.load(f)
    return xgb_model, lgb_model, meta


def build_normalized_record(h):
    raw = h.get("raw") or {}
    acq_date = h.get("acq_date")
    if isinstance(acq_date, str):
        acq_date = datetime.fromisoformat(acq_date.replace("Z", "+00:00"))
    acquisition_date = acq_date.date() if acq_date else date.today()
    acquisition_time = str(raw.get("acq_time", "00:00")).zfill(4)
    acquisition_time = f"{acquisition_time[:2]}:{acquisition_time[2:]}"

    return {
        "latitude": float(h["lat"]),
        "longitude": float(h["lon"]),
        "bright_ti4": float(h.get("brightness_ti4") or raw.get("bright_ti4", 300.0)),
        "bright_ti5": float(raw.get("bright_ti5", 280.0)),
        "scan": float(raw.get("scan", 1.0)),
        "track": float(raw.get("track", 1.0)),
        "acquisition_date": acquisition_date,
        "acquisition_time": acquisition_time,
        "satellite": h.get("satellite") or raw.get("satellite", "VIIRS_SNPP_NRT"),
        "instrument": raw.get("instrument", "VIIRS"),
        "confidence": h.get("confidence") or raw.get("confidence", "n"),
        "version": raw.get("version", "2.0NRT"),
        "frp": float(h["frp"]),
        "daynight": raw.get("daynight", "D"),
        "region": raw.get("cluster", "unknown"),
        "satellite_source": raw.get("satellite_source", h.get("satellite", "VIIRS_SNPP_NRT")),
    }


def compute_frp_zscores(records):
    """
    Compute per-pixel FRP z-score and add to each record.
    """
    df = pd.DataFrame(records)
    df['lat_cell'] = (df['latitude'] / 0.05).round() * 0.05
    df['lon_cell'] = (df['longitude'] / 0.05).round() * 0.05
    stats = df.groupby(['lat_cell', 'lon_cell'])['frp'].agg(
        frp_mean='mean', frp_std='std', frp_count='count'
    ).reset_index()
    df = df.merge(stats, on=['lat_cell', 'lon_cell'], how='left')
    df['frp_std'] = df['frp_std'].fillna(1.0).clip(lower=0.01)
    df['frp_zscore'] = ((df['frp'] - df['frp_mean']) / df['frp_std']).clip(-5, 15).fillna(0.0)
    df = df.drop(columns=['lat_cell', 'lon_cell', 'frp_mean', 'frp_std', 'frp_count'])
    return df.to_dict('records')


def add_cluster_density(records, radius_km=5.0):
    """
    Count hotspots within radius_km of each hotspot (excluding self).
    Adds 'cluster_density': {'count': int} to each record.
    """
    lats = np.array([r['latitude'] for r in records])
    lons = np.array([r['longitude'] for r in records])
    lat_rad = np.radians(lats)
    lon_rad = np.radians(lons)
    x = np.cos(lat_rad) * np.cos(lon_rad)
    y = np.cos(lat_rad) * np.sin(lon_rad)
    z = np.sin(lat_rad)
    pts = np.vstack([x, y, z]).T
    tree = cKDTree(pts)
    chord = 2 * np.sin(radius_km * 1000 / (2 * 6371000.0))
    for i, rec in enumerate(records):
        indices = tree.query_ball_point(pts[i], chord)
        rec["cluster_density"] = {"count": len(indices) - 1}
    return records


def main(write_back=False):
    print("Fetching unprocessed hotspots from backend...")
    hotspots = get_unprocessed_hotspots()
    if not hotspots:
        print("No unclassified hotspots found.")
        return

    print(f"Got {len(hotspots)} hotspots. Building normalized records...")
    records = [build_normalized_record(h) for h in hotspots]

    print("Computing FRP z-scores...")
    records = compute_frp_zscores(records)

    print("Computing cluster density...")
    records = add_cluster_density(records)

    print("Initializing enrichment pipeline...")
    pipeline = FIRMSUnifiedPipeline(
        firms_directory=FIRMS_DIR,
        landcover_directory=LANDCOVER_DIR if LANDCOVER_DIR.exists() else None,
        osm_geojson=OSM_ROADS_GEOJSON if OSM_ROADS_GEOJSON.exists() else None,
        nightfire_file=NIGHTFIRE_FILE if NIGHTFIRE_FILE.exists() else None,
        powerplants_file=POWERPLANTS_FILE if POWERPLANTS_FILE.exists() else None,
        worldpop_file=WORLDPOP_FILE if WORLDPOP_FILE.exists() else None,
    )
    engineer = FireFeatureEngineer()
    risk_engine = RiskEngine()

    # Load trained classifier if available
    xgb_model, lgb_model, meta = load_classifier()
    if xgb_model is not None:
        print("Using trained classifier for class labels.")
    else:
        print("No trained classifier found; using confidence_score as label confidence.")

    results = []
    for h, record in zip(hotspots, records):
        enriched = pipeline.process_record(record)
        enriched["frp_zscore"] = record.get("frp_zscore", 0.0)
        enriched["cluster_density"] = record.get("cluster_density", {"count": 0})

        features = engineer.transform_record(enriched)
        assessment = risk_engine.evaluate(features)

        combined = {
            "id": h["id"],
            "frp": features["frp"],
            "confidence_score": features["confidence_score"],
            "risk_score": assessment["risk_score"],
            "risk_level": assessment["risk_level"],
            "reasons": assessment["reasons"],
            "features": features,
            "enriched": enriched,
        }

        # Use classifier if available
        if xgb_model is not None:
            X = np.array([[features[col] for col in meta["feature_cols"]]], dtype=np.float32)
            xgb_proba = xgb_model.predict_proba(X)
            lgb_proba = lgb_model.predict_proba(X)
            ens_proba = 0.5 * xgb_proba + 0.5 * lgb_proba
            pred_class = int(np.argmax(ens_proba))
            combined["classification"] = meta["class_names"][str(pred_class)]
            combined["class_confidence"] = float(np.max(ens_proba))
        else:
            combined["classification"] = "Unknown"
            combined["class_confidence"] = features["confidence_score"]

        a1 = detector_run(combined)
        if a1["agent1"]["status"] == "SKIPPED":
            continue
        a2 = skeptic_run(a1)
        if a2["agent2"]["status"] == "DEBUNKED":
            continue
        a3 = dispatcher_run(a2)
        results.append(a3)

    print(f"After agents: {len(results)} hotspots validated.")
    priority_counts = {}
    for r in results:
        p = r["agent3"]["threat_priority"]
        priority_counts[p] = priority_counts.get(p, 0) + 1
    print(f"Priority distribution: {priority_counts}")

    df = pd.DataFrame(results)
    df.to_parquet(OUTPUT_DIR / "db_pipeline_results.parquet", index=False)

    patch_ok = patch_fail = 0
    incident_ok = incident_fail = 0

    if write_back:
        print("Writing back to backend...")
        for r in results:
            hid = r["id"]
            try:
                patch_hotspot(hid, {
                    "classification": r.get("classification", "Unknown"),
                    "class_confidence": r.get("class_confidence", 0.5),
                    "risk_score": r["agent3"]["risk_score"],
                    "explanation": "; ".join(r["reasons"]),
                })
                patch_ok += 1
            except Exception as e:
                patch_fail += 1
            if r["agent3"]["threat_priority"] in ("HIGH", "CRITICAL"):
                try:
                    post_incident(r["incident_payload"])
                    incident_ok += 1
                except Exception as e:
                    incident_fail += 1
        print(f"PATCH hotspots: {patch_ok} ok / {patch_fail} fail")
        print(f"POST incidents: {incident_ok} ok / {incident_fail} fail")

    status = {
        "status": "done",
        "started_at": None,
        "finished_at": datetime.now().isoformat(),
        "write_back": write_back,
        "summary": {
            "total": len(hotspots),
            "validated": len(results),
            "priority_counts": priority_counts,
            "patched": patch_ok,
            "incidents": incident_ok,
        }
    }
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)

    print(json.dumps(status["summary"]))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-back", action="store_true")
    args = parser.parse_args()
    main(write_back=args.write_back)