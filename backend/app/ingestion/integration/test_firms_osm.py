from pathlib import Path

import geopandas as gpd

from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.integration.firms_osm import FIRMSOSMPipeline


PROJECT_ROOT = Path(__file__).resolve().parents[4]

FIRMS_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "firms"
)

OSM_GEOJSON = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "osm"
    / "roads_jamnagar.geojson"
)

FIRMS_FILE = "firms_jamnagar.csv"


def find_firms_point_inside_osm(firms_file, osm_file):
    """
    Find a FIRMS hotspot that falls inside the processed
    OSM road coverage.
    """

    parser = FIRMSParser(firms_file)
    records = parser.parse()

    validator = FIRMSValidator()
    valid_records, _ = validator.validate_records(records)

    normalizer = FIRMSNormalizer()
    records = normalizer.normalize_records(valid_records)

    roads = gpd.read_file(osm_file)

    if roads.empty:
        raise ValueError("OSM GeoJSON contains no road features")

    # OSM data is stored in geographic coordinates.
    roads = roads.to_crs("EPSG:4326")

    minx, miny, maxx, maxy = roads.total_bounds

    for record in records:

        latitude = float(record["latitude"])
        longitude = float(record["longitude"])

        if (
            minx <= longitude <= maxx
            and miny <= latitude <= maxy
        ):
            return record

    raise ValueError(
        "No FIRMS hotspot found inside OSM coverage"
    )


def main():

    print("===================================")
    print("FIRMS + OSM INTEGRATION TEST")
    print("===================================")

    print("\nFIRMS directory:")
    print(FIRMS_DIR)

    print("\nOSM GeoJSON:")
    print(OSM_GEOJSON)

    firms_file = FIRMS_DIR / FIRMS_FILE

    print("\nFinding FIRMS hotspot inside OSM coverage...")

    test_record = find_firms_point_inside_osm(
        firms_file,
        OSM_GEOJSON
    )

    print(
        f"Selected hotspot: "
        f"{test_record['latitude']}, "
        f"{test_record['longitude']}"
    )

    pipeline = FIRMSOSMPipeline(
        firms_directory=FIRMS_DIR,
        osm_geojson=OSM_GEOJSON,
        radius_meters=1000
    )

    try:

        print("\nProcessing Jamnagar FIRMS data...")

        result = pipeline.process_file(
            FIRMS_FILE
        )

        print("\nResults:")
        print(f"Parsed:       {result['parsed']}")
        print(f"Valid:        {result['valid']}")
        print(f"Invalid:      {result['invalid']}")
        print(f"Enriched:     {result['enriched']}")
        print(f"OSM failures: {result['osm_failures']}")

        assert result["parsed"] > 0
        assert result["valid"] > 0
        assert result["enriched"] == result["valid"]
        assert result["osm_failures"] == 0

        # Find the exact FIRMS record selected above.
        selected_result = None

        for record in result["records"]:

            if (
                float(record["latitude"])
                == float(test_record["latitude"])
                and
                float(record["longitude"])
                == float(test_record["longitude"])
            ):
                selected_result = record
                break

        assert selected_result is not None

        osm = selected_result["osm"]

        assert osm is not None

        print("\nSelected enriched record:")
        print(f"Latitude:       {selected_result['latitude']}")
        print(f"Longitude:      {selected_result['longitude']}")
        print(f"Nearby roads:   {osm['road_count']}")
        print(f"Nearest road:   {osm['nearest_road']}")
        print(
            f"Distance:       "
            f"{osm['nearest_road_distance_m']} m"
        )

        # The selected hotspot must actually have a nearby road.
        assert osm["road_count"] > 0
        assert osm["nearest_road_distance_m"] is not None

        print("\n===================================")
        print("✓ FIRMS + OSM INTEGRATION PASSED")
        print("===================================")

    finally:

        pipeline.close()


if __name__ == "__main__":
    main()