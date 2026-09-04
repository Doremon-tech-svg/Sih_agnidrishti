"""
Automated test and verification suite for Multi-City Unified Dataset Generation (Phase 9).
"""

from pathlib import Path
import json
import pandas as pd

from backend.app.dataset.cities import CITIES, get_city_config
from backend.app.dataset.generator import UnifiedDatasetGenerator


BASE_DIR = Path(__file__).resolve().parents[3]


def test_city_configs():
    print("\n--- 1. Testing Multi-City Registry Configurations ---")
    for key, cfg in CITIES.items():
        assert "firms_file" in cfg
        assert "bbox" in cfg
        assert "center" in cfg
        firms_path = BASE_DIR / "data" / "raw" / "firms" / cfg["firms_file"]
        assert firms_path.exists(), f"Missing FIRMS file for {key}: {firms_path}"
        print(f"[PASS] City '{key}' configured properly -> {cfg['firms_file']}")


def test_jamnagar_batch_generation():
    print("\n--- 2. Testing Batch Dataset Generation for Jamnagar (Sample) ---")
    generator = UnifiedDatasetGenerator(base_dir=BASE_DIR)

    try:
        SAMPLE_LIMIT = 10
        result = generator.process_city("jamnagar", limit=SAMPLE_LIMIT, verbose=False)

        assert result["total_records"] == SAMPLE_LIMIT
        export_paths = result["export_paths"]

        # Check CSV
        assert "csv" in export_paths
        csv_file = Path(export_paths["csv"])
        assert csv_file.exists()
        df = pd.read_csv(csv_file)
        assert len(df) == SAMPLE_LIMIT
        assert "risk_score" in df.columns
        assert "risk_level" in df.columns
        assert "risk_reasons" in df.columns
        assert "frp" in df.columns
        assert "nearest_road_distance_m" in df.columns
        assert not df["risk_score"].isnull().any()
        print(f"[PASS] CSV exported successfully ({df.shape[0]} rows x {df.shape[1]} columns, 0 NaNs).")

        # Check GeoJSON
        assert "geojson" in export_paths
        geojson_file = Path(export_paths["geojson"])
        assert geojson_file.exists()
        with open(geojson_file, "r", encoding="utf-8") as f:
            gj = json.load(f)
        assert gj["type"] == "FeatureCollection"
        assert len(gj["features"]) == SAMPLE_LIMIT
        first_feat = gj["features"][0]
        assert first_feat["geometry"]["type"] == "Point"
        assert len(first_feat["geometry"]["coordinates"]) == 2
        assert "risk_score" in first_feat["properties"]
        print(f"[PASS] GeoJSON verified with {len(gj['features'])} valid Point features.")

        # Check Parquet if available
        if "parquet" in export_paths:
            parquet_file = Path(export_paths["parquet"])
            assert parquet_file.exists()
            df_p = pd.read_parquet(parquet_file)
            assert len(df_p) == SAMPLE_LIMIT
            print(f"[PASS] Parquet analytical dataset verified ({df_p.shape[0]} rows).")

        print("[PASS] Jamnagar batch unified dataset generation test passed completely.")

    finally:
        generator.close()


def test_multi_city_surat_generation():
    print("\n--- 3. Testing Multi-City Generalization (Surat Sample) ---")
    generator = UnifiedDatasetGenerator(base_dir=BASE_DIR)

    try:
        SAMPLE_LIMIT = 5
        result = generator.process_city("surat", limit=SAMPLE_LIMIT, verbose=False)

        assert result["total_records"] == SAMPLE_LIMIT
        csv_file = Path(result["export_paths"]["csv"])
        assert csv_file.exists()
        df = pd.read_csv(csv_file)
        assert len(df) == SAMPLE_LIMIT
        assert df["city"].iloc[0] == "surat"
        print(f"[PASS] Surat dataset processed seamlessly ({len(df)} records).")

    finally:
        generator.close()


def main():
    print("==================================================")
    print("AGNIDRISHTI - PHASE 9 UNIFIED DATASET TEST SUITE")
    print("==================================================")
    test_city_configs()
    test_jamnagar_batch_generation()
    test_multi_city_surat_generation()
    print("\n==================================================")
    print("ALL PHASE 9 DATASET TESTS PASSED SUCCESSFULLY!")
    print("==================================================")


if __name__ == "__main__":
    main()
