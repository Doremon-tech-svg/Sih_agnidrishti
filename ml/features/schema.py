""""
Schema and constants for AgniDrishti Feature Engineering.
"""

# Default distance imputation cap (in meters) when a spatial feature is not within search radius
DEFAULT_MAX_DISTANCE_M = 5000.0

# Critical proximity thresholds (in meters)
ROAD_PROXIMITY_THRESHOLD_M = 100.0
BUILDING_PROXIMITY_THRESHOLD_M = 500.0
SETTLEMENT_PROXIMITY_THRESHOLD_M = 500.0
INDUSTRIAL_PROXIMITY_THRESHOLD_M = 1000.0
WATER_PROXIMITY_THRESHOLD_M = 1000.0

# ESA WorldCover class codes
CROPLAND_CLASS_CODES = {40}
VEGETATION_CLASS_CODES = {10, 20, 30, 90, 95}
BUILT_UP_CLASS_CODES = {50}
WATER_CLASS_CODES = {80}
BARE_LAND_CLASS_CODES = {60}

# Confidence mapping for categorical ratings
CONFIDENCE_MAPPING = {
    "l": 0.3,
    "low": 0.3,
    "n": 0.6,
    "nominal": 0.6,
    "h": 0.95,
    "high": 0.95,
}

# New constants for additional sources
NIGHTFIRE_MATCH_DISTANCE_M = 2000.0
POWERPLANT_MATCH_DISTANCE_M = 5000.0
WORLDPOP_DEFAULT_DENSITY = 0.0

# Ordered list of all engineered feature names
FEATURE_COLUMNS = [
    # Location & Identification
    "latitude",
    "longitude",

    # Temporal
    "acquisition_hour",
    "acquisition_month",
    "is_night",

    # FIRMS Fire Intensity & Reliability
    "frp",
    "frp_zscore",             # NEW: anomaly score
    "brightness",
    "confidence_score",
    "scan",
    "track",

    # LandCover Context
    "landcover_code",
    "is_cropland",
    "is_vegetation",
    "is_built_up",
    "is_water",
    "is_bare_land",

    # OSM Accessibility & Roads
    "nearest_road_distance_m",
    "nearby_road_count",
    "is_road_adjacent",

    # OSM Buildings & Settlements (Vulnerability)
    "building_count",
    "nearest_building_distance_m",
    "has_nearby_buildings",
    "settlement_count",
    "nearest_settlement_distance_m",
    "is_near_settlement",

    # OSM Industrial (Hazard)
    "industrial_count",
    "nearest_industrial_distance_m",
    "is_near_industrial",

    # OSM Water (Barrier / Fire Suppression)
    "water_body_count",
    "nearest_water_distance_m",
    "has_nearby_water",

    # OSM Overall Infrastructure Density
    "poi_count",
    "landuse_count",

    # Nightfire / Gas Flare
    "nearest_nightfire_distance_m",
    "nightfire_detection_freq",
    "is_nightfire_match",

    # Power Plants (Hazard / Industrial)
    "nearest_powerplant_distance_m",
    "powerplant_capacity_mw",
    "powerplant_count",

    # Population (Vulnerability)
    "population_density",

    # Cluster Density (NEW: number of hotspots within 5km)
    "cluster_density",
]