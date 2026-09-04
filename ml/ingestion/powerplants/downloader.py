import requests
from pathlib import Path

# List of possible URLs (try in order)
URLS = [
    "https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv",
    "https://wri-datapans.s3.amazonaws.com/global_power_plant_database/global_power_plant_database.csv",
    "https://datasets.wri.org/api/3/action/package_show?id=global_power_plant_database"  # not a direct CSV, fallback last
]

def download_powerplants(dest_dir):
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / "global_power_plant_database.csv"
    if target.exists():
        print(f"Already exists: {target}")
        return target

    for url in URLS:
        try:
            print(f"Trying {url}")
            r = requests.get(url, stream=True, timeout=30)
            if r.status_code == 200:
                # Only write if content looks like CSV (skip JSON)
                if 'text/csv' in r.headers.get('Content-Type', '') or url.endswith('.csv'):
                    with open(target, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 1024):
                            f.write(chunk)
                    print(f"Saved: {target}")
                    return target
                else:
                    print("Not a CSV content type, skipping.")
            else:
                print(f"Failed with status {r.status_code}")
        except Exception as e:
            print(f"Error: {e}")
            continue

    raise RuntimeError("All URLs failed to download power plant database.")

if __name__ == "__main__":
    import sys
    dest = sys.argv[1] if len(sys.argv) > 1 else "data/raw/powerplants"
    download_powerplants(dest)