# ml/config.py
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
CACHE_DIR = DATA_DIR / "cache"

# Raw data paths
FIRMS_DIR = RAW_DIR / "firms"
FIRMS_FILE = FIRMS_DIR / "firms_gujarat.csv"        # for live pipeline
INDIA_FIRMS_FILE = FIRMS_DIR / "firms_india.csv"     # for future training
NIGHTFIRE_FILE = RAW_DIR / "nightfire" / "vnf_gujrat_clusters.csv"
LANDCOVER_DIR = RAW_DIR / "landcover"
OSM_ROADS_GEOJSON = PROCESSED_DIR / "osm" / "roads_gujarat.geojson"
POWERPLANTS_FILE = RAW_DIR / "powerplants" / "global_power_plant_database.csv"
WORLDPOP_FILE = RAW_DIR / "worldpop" / "ind_pd_2020_1km.tif"

# Output directories
OUTPUT_DIR = PROJECT_ROOT / "ml" / "output"
MODEL_DIR = PROJECT_ROOT / "ml" / "models" / "artifacts"

for d in [OUTPUT_DIR, MODEL_DIR, PROCESSED_DIR, CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

API_BASE = "http://localhost:4000/api"
DB_URL = "postgresql://sih:sih@localhost:5432/firewatch"