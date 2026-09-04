from pathlib import Path

from poi_extractor import OSMPOIExtractor


PROJECT_ROOT = Path(__file__).resolve().parents[4]

OSM_FILE = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "osm"
    / "western-zone-260830.osm.pbf"
)


LATITUDE = 22.4707
LONGITUDE = 70.0577


def main():

    print("===================================")
    print("OSM POI / LANDUSE TEST")
    print("===================================")

    print(f"\nOSM file:")
    print(OSM_FILE)

    extractor = OSMPOIExtractor(
        OSM_FILE
    )

    print("\nExtracting POIs around Jamnagar...")

    pois = extractor.extract_pois(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        radius=0.05
    )

    print(f"POI features: {len(pois)}")

    if not pois.empty:

        columns = [
            column
            for column in [
                "name",
                "amenity",
                "shop",
                "tourism",
                "office"
            ]
            if column in pois.columns
        ]

        if columns:
            print("\nSample POIs:")
            print(
                pois[columns].head()
            )

    print("\nExtracting land-use features...")

    landuse = extractor.extract_landuse(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        radius=0.05
    )

    print(
        f"Land-use features: {len(landuse)}"
    )

    if not landuse.empty:

        columns = [
            column
            for column in [
                "landuse",
                "name",
                "geometry"
            ]
            if column in landuse.columns
        ]

        if columns:
            print("\nSample land-use:")
            print(
                landuse[columns].head()
            )

    print("\n===================================")
    print("✓ OSM POI / LANDUSE TEST PASSED")
    print("===================================")


if __name__ == "__main__":
    main()