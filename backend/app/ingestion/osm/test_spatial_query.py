from pathlib import Path

from spatial_query import OSMSpatialQuery


PROJECT_ROOT = Path(__file__).resolve().parents[4]

GEOJSON_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "osm"
    / "roads_jamnagar.geojson"
)


# Jamnagar test coordinate
LATITUDE = 22.4707
LONGITUDE = 70.0577


def main():

    print("===================================")
    print("OSM SPATIAL QUERY TEST")
    print("===================================")

    print(f"\nGeoJSON:")
    print(GEOJSON_FILE)

    query = OSMSpatialQuery(
        GEOJSON_FILE
    )

    print("\nSearching for roads within 1 km...")

    result = query.nearby_roads(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        radius_meters=1000
    )

    print("\nResult:")
    print(f"Latitude:              {result['latitude']}")
    print(f"Longitude:             {result['longitude']}")
    print(f"Radius:                {result['radius_meters']} m")
    print(f"Nearby roads:          {result['road_count']}")
    print(f"Nearest road:          {result['nearest_road']}")
    print(
        f"Nearest road distance: "
        f"{result['nearest_road_distance_m']} m"
    )

    assert result["road_count"] >= 0

    if result["road_count"] > 0:
        assert result["nearest_road_distance_m"] is not None

    print("\n===================================")
    print("✓ OSM SPATIAL QUERY TEST PASSED")
    print("===================================")


if __name__ == "__main__":
    main()