import requests
from pathlib import Path

# v100 (2020) base
BASE_V100 = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v100/2020/map"
FILE_PREFIX_V100 = "ESA_WorldCover_10m_2020_v100"
FILE_SUFFIX = "_Map.tif"

# v200 (2021) fallback
BASE_V200 = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
FILE_PREFIX_V200 = "ESA_WorldCover_10m_2021_v200"

# Gujarat tiles (3°x3° grid, lower-left corner multiples of 3)
TILES = ["N21E069", "N21E072", "N24E069", "N24E072"]

def try_download(url, dest):
    print(f"Trying {url}")
    r = requests.get(url, stream=True)
    if r.status_code == 200:
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024*1024):
                f.write(chunk)
        print(f"Saved: {dest}")
        return True
    print(f"  Status: {r.status_code}")
    return False

def download_tile(tile, dest_dir):
    dest = Path(dest_dir) / f"{FILE_PREFIX_V100}_{tile}{FILE_SUFFIX}"
    if dest.exists():
        print(f"Already exists: {dest}")
        return

    # Try v100 first
    url_v100 = f"{BASE_V100}/{FILE_PREFIX_V100}_{tile}{FILE_SUFFIX}"
    if try_download(url_v100, dest):
        return

    # Try v200 fallback
    dest_v200 = Path(dest_dir) / f"{FILE_PREFIX_V200}_{tile}{FILE_SUFFIX}"
    if dest_v200.exists():
        print(f"Already exists: {dest_v200}")
        return
    url_v200 = f"{BASE_V200}/{FILE_PREFIX_V200}_{tile}{FILE_SUFFIX}"
    if try_download(url_v200, dest_v200):
        return

    print(f"Failed to download tile {tile}")

def download_all(dest_dir):
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    for tile in TILES:
        download_tile(tile, dest)

if __name__ == "__main__":
    import sys
    dest = sys.argv[1] if len(sys.argv) > 1 else "data/raw/landcover"
    download_all(dest)