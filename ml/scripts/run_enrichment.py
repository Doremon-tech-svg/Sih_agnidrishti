import sys
from pathlib import Path
import pandas as pd
import numpy as np

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.config import FIRMS_DIR, NIGHTFIRE_FILE, LANDCOVER_DIR, OSM_ROADS_GEOJSON, POWERPLANTS_FILE, WORLDPOP_FILE, OUTPUT_DIR, FIRMS_FILE
from ml.ingestion.integration.firms_unified import FIRMSUnifiedPipeline

def compute_frp_zscore(records):
    """
    Compute per-pixel FRP baseline (mean, std, count) and z-score.
    Appends 'frp_zscore' to each record.
    """
    df = pd.DataFrame(records)
    # Round coordinates to 0.05° grid (~5 km)
    df['lat_cell'] = (df['latitude'] / 0.05).round() * 0.05
    df['lon_cell'] = (df['longitude'] / 0.05).round() * 0.05

    stats = (
        df.groupby(['lat_cell', 'lon_cell'])['frp']
        .agg(frp_mean='mean', frp_std='std', frp_count='count')
        .reset_index()
    )
    df = df.merge(stats, on=['lat_cell', 'lon_cell'], how='left')
    df['frp_std'] = df['frp_std'].fillna(1.0).clip(lower=0.01)
    df['frp_zscore'] = ((df['frp'] - df['frp_mean']) / df['frp_std']).clip(-5, 15).fillna(0.0)

    # Convert back to list of dicts
    records_with_z = df.to_dict('records')
    return records_with_z

def main():
    firms_file = FIRMS_DIR / "firms_gujarat.csv"
    firms_file = FIRMS_FILE
    if not firms_file.exists():
        print(f"Combined FIRMS file not found: {firms_file}")
        return

    print("Initializing unified pipeline...")
    pipeline = FIRMSUnifiedPipeline(
        firms_directory=FIRMS_DIR,
        landcover_directory=LANDCOVER_DIR if LANDCOVER_DIR.exists() else None,
        osm_geojson=OSM_ROADS_GEOJSON if OSM_ROADS_GEOJSON.exists() else None,
        nightfire_file=NIGHTFIRE_FILE if NIGHTFIRE_FILE.exists() else None,
        powerplants_file=POWERPLANTS_FILE if POWERPLANTS_FILE.exists() else None,
        worldpop_file=WORLDPOP_FILE if WORLDPOP_FILE.exists() else None,
        radius_meters=1000,
        radius_degrees=0.05,
    )

    print("Processing combined FIRMS file...")
    result = pipeline.process_file("firms_gujarat.csv")

    print(f"Parsed: {result['parsed']}")
    print(f"Valid: {result['valid']}")
    print(f"Invalid: {result['invalid']}")
    print(f"Enriched: {result['enriched']}")

    # Add FRP z-score
    print("Computing FRP z-score...")
    records_with_z = compute_frp_zscore(result['records'])

    # Save enriched records
    df = pd.DataFrame(records_with_z)
    out_path = OUTPUT_DIR / "enriched_gujarat.parquet"
    df.to_parquet(out_path, index=False)
    print(f"Saved enriched data to {out_path}")

    pipeline.close()

if __name__ == "__main__":
    main()