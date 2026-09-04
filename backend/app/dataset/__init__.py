"""
AgniDrishti Unified Dataset Generation Package.
Generates multi-city golden datasets combining FIRMS, LandCover, OSM, 33-features, and Explainable Risk.
"""

from backend.app.dataset.generator import UnifiedDatasetGenerator
from backend.app.dataset.cities import CITIES, get_city_config

__all__ = ["UnifiedDatasetGenerator", "CITIES", "get_city_config"]
