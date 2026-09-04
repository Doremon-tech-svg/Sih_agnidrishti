"""
Verification and test suite for AgniDrishti Feature Engineering.
"""

from pathlib import Path
import json
import pandas as pd

from backend.app.features.engineer import FireFeatureEngineer
from backend.app.features.schema import FEATURE_COLUMNS
from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.integration.firms_unified import FIRMSUnifiedPipeline


BASE_DIR = Path(__file__).resolve().parents[3]
FIRMS_DIR = BASE_DIR / "data" / "raw" / "firms"
LANDCOVER_DIR = BASE_DIR / "data" / "raw" / "landcover"
OSM_FILE = BASE_DIR / "data" / "raw" / "osm" / "western-zone-260830.osm.pbf"
OSM_GEOJSON = BASE_DIR / "data" / "processed" / "osm" / "roads_jamnagar.geojson"


def test_mock_records():
    print("\n--- 1. Testing Feature Engineer with Edge-Case / Mock Records ---")
    engineer = FireFeatureEngineer()

    # Case A: Minimal / empty enrichment record
    empty_record = {
        "latitude": 22.4,
        "longitude": 70.0,
        "frp": 12.5,
        "confidence": "h",
        "daynight": "N",
        "acq_date": "2024-05-15",
        "acq_time": "2130",
        "landcover": None,
        "osm": None,
    }
    feat_a = engineer.transform_record(empty_record)
    assert feat_a["is_night"] == 1
    assert feat_a["confidence_score"] == 0.95
    assert feat_a["acquisition_hour"] == 21
    assert feat_a["acquisition_month"] == 5
    assert feat_a["landcover_code"] == 0
    assert feat_a["nearest_road_distance_m"] == 5000.0
    assert feat_a["is_near_industrial"] == 0
    print("[PASS] Empty enrichment fallback handled cleanly.")

    # Case B: LandCover cropland + OSM industrial proximity
    enriched_mock = {
        "latitude": 22.45,
        "longitude": 70.08,
        "frp": 35.0,
        "bright_ti4": 340.5,
        "confidence": 85,
        "daynight": "D",
        "acq_date": "2024-03-10",
        "acq_time": "11:20",
        "landcover": {"class_code": 40, "class_name": "Cropland"},
        "osm": {
            "nearest_road_distance_m": 45.2,
            "nearby_roads": 12,
            "buildings": {"count": 4, "nearest_distance_m": 120.0},
            "settlements": {"count": 1, "nearest_distance_m": 350.0},
            "industrial_areas": {"count": 2, "nearest_distance_m": 420.0},
            "water_bodies": {"count": 0, "nearest_distance_m": None},
            "poi_count": 15,
            "landuse_count": 8,
        },
    }
    feat_b = engineer.transform_record(enriched_mock)
    assert feat_b["is_cropland"] == 1
    assert feat_b["is_vegetation"] == 0
    assert feat_b["is_road_adjacent"] == 1
    assert feat_b["has_nearby_buildings"] == 1
    assert feat_b["is_near_settlement"] == 1
    assert feat_b["is_near_industrial"] == 1
    assert feat_b["has_nearby_water"] == 0
    assert feat_b["confidence_score"] == 0.85
    print("[PASS] Full context transformation and boolean indicators verified.")

    # Case C: DataFrame batch transformation
    df = engineer.to_dataframe([empty_record, enriched_mock])
    assert len(df) == 2
    assert list(df.columns) == FEATURE_COLUMNS
    assert not df.isnull().any().any(), "DataFrame contains unexpected NaN values"
    print(f"[PASS] DataFrame conversion verified ({df.shape[0]} rows x {df.shape[1]} columns, 0 NaNs).")


def test_live_unified_hotspot():
    print("\n--- 2. Testing Feature Engineer with Live Jamnagar Pipeline Hotspot ---")
    firms_file = FIRMS_DIR / "firms_jamnagar.csv"
    if not firms_file.exists():
        print(f"[SKIP] Jamnagar file not found: {firms_file}")
        return

    # Ingestion & Enrichment
    parser = FIRMSParser(firms_file)
    records = parser.parse()
    validator = FIRMSValidator()
    valid_records, _ = validator.validate_records(records)
    normalizer = FIRMSNormalizer()
    normalized_records = normalizer.normalize_records(valid_records)

    # Pick closest record to Jamnagar center
    JAMNAGAR_LAT = 22.40527
    JAMNAGAR_LON = 70.03604
    record = min(
        normalized_records,
        key=lambda r: (r["latitude"] - JAMNAGAR_LAT) ** 2
        + (r["longitude"] - JAMNAGAR_LON) ** 2,
    )

    pipeline = FIRMSUnifiedPipeline(
        firms_directory=FIRMS_DIR,
        landcover_directory=LANDCOVER_DIR,
        osm_file=OSM_FILE,
        osm_geojson=OSM_GEOJSON,
        radius_meters=1000,
        radius_degrees=0.05,
    )

    try:
        enriched_record = pipeline.process_record(record)
        print("[INFO] Hotspot enriched with LandCover & OSM successfully.")

        engineer = FireFeatureEngineer()
        features = engineer.transform_record(enriched_record)

        print("\n===================================")
        print("ENGINEERED FEATURE VECTOR (JSON)")
        print("===================================")
        print(json.dumps(features, indent=2))

        # Check all expected columns are present
        for col in FEATURE_COLUMNS:
            assert col in features, f"Missing feature column: {col}"

        # Convert to DataFrame row
        df_row = engineer.to_dataframe([enriched_record])
        print("\n===================================")
        print("DATAFRAME ROW SHAPE & SUMMARY")
        print("===================================")
        print(f"Shape: {df_row.shape}")
        print(df_row.iloc[0].to_dict())

        assert not df_row.isnull().any().any(), "Live record produced NaNs!"
        print("\n[PASS] Live hotspot successfully transformed into clean feature vector!")

    finally:
        pipeline.close()


def main():
    print("==============================================")
    print("AGNIDRISHTI - PHASE 7 FEATURE ENGINEERING TEST")
    print("==============================================")
    test_mock_records()
    test_live_unified_hotspot()
    print("\n==============================================")
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("==============================================")


if __name__ == "__main__":
    main()
