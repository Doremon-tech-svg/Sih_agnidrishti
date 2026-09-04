# ml/scripts/preprocess_osm.py
import sys
from pathlib import Path
import geopandas as gpd
from pyrosm import OSM, get_data

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.config import RAW_DIR, PROCESSED_DIR

OSM_FILE = RAW_DIR / "osm" / "gujarat-latest.osm.pbf"
OUTPUT_DIR = PROCESSED_DIR / "osm"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Gujarat bounding box (west, south, east, north)
BBOX = [68.5, 21.0, 74.5, 24.0]

def main():
    if not OSM_FILE.exists():
        print(f"OSM file not found: {OSM_FILE}")
        return

    print("Initializing OSM parser...")
    osm = OSM(str(OSM_FILE), bounding_box=BBOX)

    print("Extracting roads (driving network)...")
    roads = osm.get_network(network_type="driving")
    roads = roads[["osm_id", "highway", "name", "maxspeed", "lanes", "surface", "geometry"]].drop_duplicates(subset="osm_id")
    roads.to_file(OUTPUT_DIR / "roads_gujarat.geojson", driver="GeoJSON")
    print(f"Saved roads: {len(roads)} features")

    print("Extracting buildings...")
    buildings = osm.get_buildings()
    if buildings is not None and not buildings.empty:
        buildings = buildings[["osm_id", "building", "name", "geometry"]].drop_duplicates(subset="osm_id")
        buildings.to_file(OUTPUT_DIR / "buildings_gujarat.geojson", driver="GeoJSON")
        print(f"Saved buildings: {len(buildings)} features")
    else:
        print("No buildings found.")

    print("Extracting landuse...")
    landuse = osm.get_landuse()
    if landuse is not None and not landuse.empty:
        landuse = landuse[["osm_id", "landuse", "name", "geometry"]].drop_duplicates(subset="osm_id")
        landuse.to_file(OUTPUT_DIR / "landuse_gujarat.geojson", driver="GeoJSON")
        print(f"Saved landuse: {len(landuse)} features")
    else:
        print("No landuse found.")

    print("Done.")

if __name__ == "__main__":
    main()