from pathlib import Path

from preprocessor import OSMPreprocessor


PROJECT_ROOT = Path(__file__).resolve().parents[4]

OSM_FILE = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "osm"
    / "western-zone-260830.osm.pbf"
)

OUTPUT_DIRECTORY = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "osm"
)


# Jamnagar approximate bounding box
WEST = 69.95
SOUTH = 22.40
EAST = 70.15
NORTH = 22.55


def main():

    print("===================================")
    print("OSM PREPROCESSOR TEST")
    print("===================================")

    print(f"\nInput:")
    print(OSM_FILE)

    print(f"\nOutput:")
    print(OUTPUT_DIRECTORY)

    preprocessor = OSMPreprocessor(
        osm_file=OSM_FILE,
        output_directory=OUTPUT_DIRECTORY
    )

    print("\nExtracting Jamnagar roads...")

    roads = preprocessor.extract_roads(
        west=WEST,
        south=SOUTH,
        east=EAST,
        north=NORTH
    )

    print(f"Raw road features: {len(roads)}")

    print("\nCleaning roads...")

    roads = preprocessor.clean_roads(roads)

    print(f"Clean road features: {len(roads)}")

    output_path = preprocessor.save_geojson(
        roads,
        "roads_jamnagar.geojson"
    )

    print("\nSaved:")
    print(output_path)

    print("\n===================================")
    print("✓ OSM PREPROCESSOR TEST PASSED")
    print("===================================")


if __name__ == "__main__":
    main()