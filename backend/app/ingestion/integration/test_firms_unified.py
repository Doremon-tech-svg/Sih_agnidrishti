from pathlib import Path

from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.integration.firms_unified import (
    FIRMSUnifiedPipeline,
)


BASE_DIR = Path(__file__).resolve().parents[4]

FIRMS_DIR = BASE_DIR / "data" / "raw" / "firms"
LANDCOVER_DIR = BASE_DIR / "data" / "raw" / "landcover"

OSM_FILE = (
    BASE_DIR
    / "data"
    / "raw"
    / "osm"
    / "western-zone-260830.osm.pbf"
)

OSM_GEOJSON = (
    BASE_DIR
    / "data"
    / "processed"
    / "osm"
    / "roads_jamnagar.geojson"
)


def main():

    print("===================================")
    print("SINGLE FIRMS + LANDCOVER + OSM TEST")
    print("===================================")


    firms_file = FIRMS_DIR / "firms_jamnagar.csv"

    if not firms_file.exists():
        raise FileNotFoundError(
            f"Jamnagar FIRMS file not found: {firms_file}"
        )

    print()
    print("FIRMS file:")
    print(firms_file)

    # -----------------------------
    # Parse
    # -----------------------------
    parser = FIRMSParser(firms_file)
    records = parser.parse()

    print()
    print("Parsed records:", len(records))

    # -----------------------------
    # Validate
    # -----------------------------
    validator = FIRMSValidator()

    valid_records, invalid_records = (
        validator.validate_records(records)
    )

    print("Valid records:", len(valid_records))
    print("Invalid records:", len(invalid_records))

    if not valid_records:
        raise RuntimeError(
            "No valid FIRMS records available"
        )

    # -----------------------------
    # Normalize
    # -----------------------------
    normalizer = FIRMSNormalizer()

    normalized_records = (
        normalizer.normalize_records(
            valid_records
        )
    )

       # --------------------------------
    # Select a hotspot inside Jamnagar
    # --------------------------------
    JAMNAGAR_LAT = 22.40527
    JAMNAGAR_LON = 70.03604

    def distance_from_jamnagar(record):
        lat_diff = record["latitude"] - JAMNAGAR_LAT
        lon_diff = record["longitude"] - JAMNAGAR_LON

        return (lat_diff ** 2 + lon_diff ** 2) ** 0.5

    record = min(
        normalized_records,
        key=distance_from_jamnagar
    )

    print()
    print("Selected hotspot:")
    print(
        f"Latitude:  {record['latitude']}"
    )
    print(
        f"Longitude: {record['longitude']}"
    )

    # -----------------------------
    # Create pipeline
    # -----------------------------
    pipeline = FIRMSUnifiedPipeline(
        firms_directory=FIRMS_DIR,
        landcover_directory=LANDCOVER_DIR,
        osm_file=OSM_FILE,
        osm_geojson=OSM_GEOJSON,
        radius_meters=1000,
        radius_degrees=0.05,
    )

    try:

        print()
        print("Enriching ONE hotspot...")

        enriched = pipeline.process_record(
            record
        )

        print()
        print("===================================")
        print("UNIFIED RECORD")
        print("===================================")

        print()
        print("FIRMS")
        print(
            "Latitude:",
            enriched.get("latitude")
        )
        print(
            "Longitude:",
            enriched.get("longitude")
        )
        print(
            "FRP:",
            enriched.get("frp")
        )
        print(
            "Brightness:",
            enriched.get("brightness")
        )
        print(
            "Confidence:",
            enriched.get("confidence")
        )

        print()
        print("LANDCOVER")
        print(
            enriched.get("landcover")
        )

        print()
        print("OSM")

        osm = enriched.get("osm")

        if osm is None:
            print("None")
        else:
            print(osm)

        print()
        print("===================================")
        print("✓ SINGLE RECORD TEST PASSED")
        print("===================================")

    finally:

        pipeline.close()


if __name__ == "__main__":
    main()