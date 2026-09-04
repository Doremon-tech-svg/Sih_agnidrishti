from pathlib import Path

from extractor import OSMExtractor


PROJECT_ROOT = Path(__file__).resolve().parents[4]

OSM_FILE = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "osm"
    / "western-zone-260830.osm.pbf"
)


# Test location: Jamnagar
LATITUDE = 22.4707
LONGITUDE = 70.0577


def main():

    print("===================================")
    print("OSM EXTRACTOR TEST")
    print("===================================")

    print(f"\nOSM file:")
    print(OSM_FILE)

    extractor = OSMExtractor(OSM_FILE)

    try:

        print("\nExtracting roads around Jamnagar...")

        roads = extractor.extract_roads_around_point(
            latitude=LATITUDE,
            longitude=LONGITUDE,
            radius=0.05
        )

        print(f"\nRoad features: {len(roads)}")

        if len(roads) > 0:

            print("\nSample features:")

            columns = [
                column
                for column in ["highway", "name"]
                if column in roads.columns
            ]

            print(roads[columns].head())

        print("\n===================================")
        print("✓ OSM EXTRACTOR TEST PASSED")
        print("===================================")

    finally:
        extractor.close()


if __name__ == "__main__":
    main()