import requests
from pathlib import Path

URL = "https://download.bbbike.org/osm/bbbike/Gujarat/Gujarat.osm.pbf"
DEST = Path("data/raw/osm/gujarat.osm.pbf")
DEST.parent.mkdir(parents=True, exist_ok=True)

print("Downloading Gujarat OSM PBF from BBBike...")
r = requests.get(URL, stream=True)
r.raise_for_status()
with open(DEST, "wb") as f:
    for chunk in r.iter_content(chunk_size=1024*1024):
        f.write(chunk)
print(f"Saved {DEST} ({DEST.stat().st_size / 1024 / 1024:.1f} MB)")