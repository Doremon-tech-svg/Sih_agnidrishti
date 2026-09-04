from pathlib import Path

from extractor import LandCoverExtractor


PROJECT_ROOT = Path(__file__).resolve().parents[4]

LANDCOVER_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "landcover"
    / "gujarat"
)


# Approximate coordinates
LOCATIONS = {
    "Jamnagar": (22.4707, 70.0577),
    "Vadodara": (22.3072, 73.1812),
    "Surat": (21.1702, 72.8311),
}


def main():

    print("===================================")
    print("LANDCOVER MULTI-TILE TEST")
    print("===================================")

    print(f"\nLandCover directory:")
    print(LANDCOVER_DIR)

    extractor = LandCoverExtractor(LANDCOVER_DIR)

    try:

        for city, (latitude, longitude) in LOCATIONS.items():

            print(f"\n--- {city} ---")

            result = extractor.extract_landcover(
                latitude=latitude,
                longitude=longitude
            )

            print(f"Latitude:   {result['latitude']}")
            print(f"Longitude:  {result['longitude']}")
            print(f"Class code: {result['class_code']}")
            print(f"Class name: {result['class_name']}")
            print(f"Tile:       {result['tile']}")

        print("\n===================================")
        print("✓ ALL TESTS PASSED")
        print("===================================")

    finally:
        extractor.close()


if __name__ == "__main__":
    main()