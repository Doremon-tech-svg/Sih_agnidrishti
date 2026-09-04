import os
import requests
from pathlib import Path

# Gujarat extract from Geofabrik (India)
OSM_URL = "https://download.geofabrik.de/asia/india/gujarat-latest.osm.pbf"

def download_osm(destination_dir):
    dest = Path(destination_dir)
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / "gujarat-latest.osm.pbf"
    if target.exists():
        print(f"Already exists: {target}")
        return target

    print("Downloading OSM PBF for Gujarat...")
    response = requests.get(OSM_URL, stream=True)
    response.raise_for_status()
    with open(target, "wb") as f:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    print(f"Saved: {target}")
    return target

if __name__ == "__main__":
    import sys
    dest = sys.argv[1] if len(sys.argv) > 1 else "data/raw/osm"
    download_osm(dest)