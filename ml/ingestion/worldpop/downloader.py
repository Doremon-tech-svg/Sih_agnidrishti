import requests
from pathlib import Path

URL = "https://data.worldpop.org/GIS/Population_Density/Global_2000_2020_1km/2020/IND/ind_pd_2020_1km.tif"

def download_worldpop(dest_dir):
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / "ind_pd_2020_1km.tif"
    if target.exists():
        print(f"Already exists: {target}")
        return target

    print("Downloading WorldPop density for India...")
    r = requests.get(URL, stream=True)
    r.raise_for_status()
    with open(target, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    print(f"Saved: {target}")
    return target

if __name__ == "__main__":
    import sys
    dest = sys.argv[1] if len(sys.argv) > 1 else "data/raw/worldpop"
    download_worldpop(dest)