"""
City Registry and Configuration for Multi-City Unified Processing.
Maps cities and regional clusters to their respective FIRMS data, bounding boxes, and OSM road networks.
"""

from typing import Any, Dict, Optional


CITIES: Dict[str, Dict[str, Any]] = {
    "jamnagar": {
        "display_name": "Jamnagar",
        "firms_file": "firms_jamnagar.csv",
        "road_geojson": "roads_jamnagar.geojson",
        "bbox": [69.95, 22.40, 70.15, 22.55],
        "center": {"lat": 22.4707, "lon": 70.0577},
        "description": "Major industrial petroleum refining corridor (Reliance, Nayara)",
    },
    "surat": {
        "display_name": "Surat",
        "firms_file": "firms_surat.csv",
        "road_geojson": "roads_surat.geojson",
        "bbox": [72.70, 21.05, 72.98, 21.30],
        "center": {"lat": 21.1702, "lon": 72.8311},
        "description": "Textile, diamond, and chemical manufacturing hub (Hazira belt)",
    },
    "vadodara": {
        "display_name": "Vadodara",
        "firms_file": "firms_vadodara.csv",
        "road_geojson": "roads_vadodara.geojson",
        "bbox": [73.10, 22.20, 73.30, 22.40],
        "center": {"lat": 22.3072, "lon": 73.1812},
        "description": "Petrochemical and heavy engineering cluster",
    },
    "bharuch": {
        "display_name": "Bharuch",
        "firms_file": "firms_bharuch.csv",
        "road_geojson": "roads_bharuch.geojson",
        "bbox": [72.90, 21.65, 73.08, 21.80],
        "center": {"lat": 21.7051, "lon": 72.9959},
        "description": "Dahej PCPIR chemical & port zone",
    },
    "gujarat_clusters": {
        "display_name": "Gujarat Regional Clusters",
        "firms_file": "firms_gujarat_clusters.csv",
        "road_geojson": "roads_jamnagar.geojson",  # fallback road context
        "bbox": [68.10, 20.10, 74.50, 24.70],
        "center": {"lat": 22.2587, "lon": 71.1924},
        "description": "Consolidated state-level fire cluster data across Gujarat",
    },
}


def get_city_config(city_key: str) -> Optional[Dict[str, Any]]:
    """Retrieve city configuration by key (case-insensitive)."""
    key = city_key.strip().lower().replace(" ", "_")
    return CITIES.get(key)
