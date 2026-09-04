from pathlib import Path

from backend.app.ingestion.osm.context_query import OSMContextQuery


BASE_DIR = Path(__file__).resolve().parents[4]

OSM_FILE = (
    BASE_DIR
    / "data"
    / "raw"
    / "osm"
    / "western-zone-260830.osm.pbf"
)

ROAD_GEOJSON = (
    BASE_DIR
    / "data"
    / "processed"
    / "osm"
    / "roads_jamnagar.geojson"
)

LATITUDE = 22.40527
LONGITUDE = 70.03604


def main():

    print("===================================")
    print("OSM CONTEXT QUERY TEST")
    print("===================================")

    print()
    print("OSM file:")
    print(OSM_FILE)

    print()
    print("Road GeoJSON:")
    print(ROAD_GEOJSON)

    print()
    print("Querying OSM context around hotspot...")

    context = OSMContextQuery(
        osm_file=OSM_FILE,
        road_geojson=ROAD_GEOJSON
    )

    result = context.query(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        radius_meters=1000
    )

    print()
    print("Results:")
    print(f"Latitude:              {result['latitude']}")
    print(f"Longitude:             {result['longitude']}")
    print(f"Nearby roads:          {result['nearby_roads']}")
    print(f"Nearest road:          {result['nearest_road']}")
    print(
        f"Nearest road distance: "
        f"{result['nearest_road_distance_m']} m"
    )

    print()
    print("Buildings:")
    print(result["buildings"])

    print()
    print("Settlements:")
    print(result["settlements"])

    print()
    print("Industrial areas:")
    print(result["industrial_areas"])

    print()
    print("Water bodies:")
    print(result["water_bodies"])

    print()
    print(f"POIs:                  {result['poi_count']}")
    print(f"Land-use features:     {result['landuse_count']}")

    context.close()

    print()
    print("===================================")
    print("✓ OSM CONTEXT QUERY TEST PASSED")
    print("===================================")


if __name__ == "__main__":
    main()