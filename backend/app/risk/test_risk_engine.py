"""
Test and verification suite for AgniDrishti Risk Engine (Phase 8).
"""

from pathlib import Path
import json
import pandas as pd

from backend.app.risk.engine import RiskEngine
from backend.app.features.engineer import FireFeatureEngineer
from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.integration.firms_unified import FIRMSUnifiedPipeline


BASE_DIR = Path(__file__).resolve().parents[3]
FIRMS_DIR = BASE_DIR / "data" / "raw" / "firms"
LANDCOVER_DIR = BASE_DIR / "data" / "raw" / "landcover"
OSM_FILE = BASE_DIR / "data" / "raw" / "osm" / "western-zone-260830.osm.pbf"
OSM_GEOJSON = BASE_DIR / "data" / "processed" / "osm" / "roads_jamnagar.geojson"


def test_mock_risk_scenarios():
    print("\n--- 1. Testing Rule-Based Scenarios (LOW, MEDIUM, HIGH) ---")
    engine = RiskEngine()

    # 1. LOW Risk Scenario
    low_features = {
        "frp": 2.5,
        "confidence_score": 0.5,
        "is_night": 0,
        "is_cropland": 0,
        "is_vegetation": 0,
        "is_built_up": 0,
        "nearest_road_distance_m": 800.0,
        "is_road_adjacent": 0,
        "building_count": 0,
        "nearest_building_distance_m": 5000.0,
        "settlement_count": 0,
        "nearest_settlement_distance_m": 5000.0,
        "industrial_count": 0,
        "nearest_industrial_distance_m": 5000.0,
        "water_body_count": 0,
        "nearest_water_distance_m": 5000.0,
    }
    low_res = engine.evaluate(low_features)
    assert low_res["risk_level"] == "LOW", f"Expected LOW, got {low_res['risk_level']}"
    assert low_res["risk_score"] <= 35.0
    print(f"[PASS] LOW Risk: Score {low_res['risk_score']} ({low_res['risk_level']})")

    # 2. MEDIUM Risk Scenario (Cropland + Road Adjacent + Moderate FRP)
    med_features = {
        "frp": 15.0,
        "confidence_score": 0.85,
        "is_night": 0,
        "is_cropland": 1,
        "is_vegetation": 0,
        "is_built_up": 0,
        "nearest_road_distance_m": 45.0,
        "is_road_adjacent": 1,
        "building_count": 1,
        "nearest_building_distance_m": 450.0,
        "settlement_count": 0,
        "nearest_settlement_distance_m": 5000.0,
        "industrial_count": 0,
        "nearest_industrial_distance_m": 5000.0,
        "water_body_count": 0,
        "nearest_water_distance_m": 5000.0,
    }
    med_res = engine.evaluate(med_features)
    assert med_res["risk_level"] == "MEDIUM", f"Expected MEDIUM, got {med_res['risk_level']}"
    assert 35.0 < med_res["risk_score"] <= 70.0
    print(f"[PASS] MEDIUM Risk: Score {med_res['risk_score']} ({med_res['risk_level']})")

    # 3. HIGH Risk Scenario (High FRP + Industrial Proximity + Settlements + Night)
    high_features = {
        "frp": 45.0,
        "confidence_score": 0.95,
        "is_night": 1,
        "is_cropland": 0,
        "is_vegetation": 1,
        "is_built_up": 0,
        "nearest_road_distance_m": 80.0,
        "is_road_adjacent": 1,
        "building_count": 6,
        "nearest_building_distance_m": 120.0,
        "settlement_count": 2,
        "nearest_settlement_distance_m": 250.0,
        "industrial_count": 2,
        "nearest_industrial_distance_m": 350.0,
        "water_body_count": 0,
        "nearest_water_distance_m": 5000.0,
    }
    high_res = engine.evaluate(high_features)
    assert high_res["risk_level"] == "HIGH", f"Expected HIGH, got {high_res['risk_level']}"
    assert high_res["risk_score"] > 70.0
    print(f"[PASS] HIGH Risk: Score {high_res['risk_score']} ({high_res['risk_level']})")
    print(f"       Reasons: {high_res['reasons']}")

    # 4. Mitigation Deduction Check
    with_water = {**high_features, "water_body_count": 1, "nearest_water_distance_m": 200.0}
    water_res = engine.evaluate(with_water)
    assert water_res["breakdown"]["mitigation_deduction"] == -10.0
    print(f"[PASS] Mitigation Factor: -10 deduction applied correctly.")

    # 5. DataFrame Batch Evaluation
    df = pd.DataFrame([low_features, med_features, high_features])
    evaluated_df = engine.evaluate_dataframe(df)
    assert "risk_score" in evaluated_df.columns
    assert "risk_level" in evaluated_df.columns
    assert "risk_reasons" in evaluated_df.columns
    print(f"[PASS] DataFrame evaluation verified ({evaluated_df.shape[0]} rows enriched with risk metrics).")


def test_live_pipeline_integration():
    print("\n--- 2. Testing End-to-End Live Pipeline (FIRMS -> LandCover -> OSM -> Features -> Risk) ---")
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
        engineer = FireFeatureEngineer()
        features = engineer.transform_record(enriched_record)

        risk_engine = RiskEngine()
        assessment = risk_engine.evaluate(features)

        print("\n===================================")
        print("EXPLAINABLE RISK ASSESSMENT OUTPUT")
        print("===================================")
        print(json.dumps(assessment, indent=2))

        assert assessment["risk_score"] >= 0.0 and assessment["risk_score"] <= 100.0
        assert assessment["risk_level"] in ("LOW", "MEDIUM", "HIGH")
        assert len(assessment["reasons"]) > 0

        print(f"\n[PASS] Live Jamnagar Hotspot Risk Assessment Complete: {assessment['risk_level']} ({assessment['risk_score']}/100)")

    finally:
        pipeline.close()


def main():
    print("==========================================")
    print("AGNIDRISHTI - PHASE 8 RISK ENGINE TEST")
    print("==========================================")
    test_mock_risk_scenarios()
    test_live_pipeline_integration()
    print("\n==========================================")
    print("ALL RISK ENGINE TESTS PASSED SUCCESSFULLY!")
    print("==========================================")


if __name__ == "__main__":
    main()
