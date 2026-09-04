""""
Rule definitions, scoring thresholds, and reasoning templates for the AgniDrishti Risk Engine.
"""

# -------------------------------------------------------------
# Risk Level Boundaries
# -------------------------------------------------------------
DEFAULT_MAX_DISTANCE_M = 5000.0   
RISK_LEVEL_LOW_MAX = 30.0
RISK_LEVEL_MEDIUM_MAX = 60.0
# Anything above 60.0 is HIGH / CRITICAL

# -------------------------------------------------------------
# Pillar 1: Fire Severity & Reliability (Max 40 points)
# -------------------------------------------------------------
FRP_HIGH_THRESHOLD = 20.0       # MW
FRP_MEDIUM_THRESHOLD = 8.0      # MW

POINTS_FRP_HIGH = 25.0
POINTS_FRP_MEDIUM = 15.0
POINTS_FRP_LOW = 8.0

CONFIDENCE_HIGH_THRESHOLD = 0.75
POINTS_HIGH_CONFIDENCE = 5.0

POINTS_NIGHT_FIRE = 10.0

# -------------------------------------------------------------
# Pillar 2: Industrial & High-Hazard Proximity (Max 30 points)
# -------------------------------------------------------------
INDUSTRIAL_CRITICAL_DIST_M = 500.0
INDUSTRIAL_WARNING_DIST_M = 1000.0

POINTS_INDUSTRIAL_CRITICAL = 30.0
POINTS_INDUSTRIAL_WARNING = 18.0

# -------------------------------------------------------------
# Pillar 3: Human Vulnerability & Settlements (Max 30 points)
# -------------------------------------------------------------
SETTLEMENT_CRITICAL_DIST_M = 300.0
SETTLEMENT_WARNING_DIST_M = 500.0

POINTS_SETTLEMENT_CRITICAL = 18.0
POINTS_SETTLEMENT_WARNING = 12.0

BUILDING_COUNT_HIGH_THRESHOLD = 5
POINTS_BUILDINGS_HIGH = 12.0
POINTS_BUILDINGS_MODERATE = 6.0

# -------------------------------------------------------------
# Pillar 4: Fuel Availability & Spread Risk (Max 25 points)
# -------------------------------------------------------------
POINTS_VEGETATION_FUEL = 20.0
POINTS_CROPLAND_FUEL = 12.0

ROAD_ADJACENT_DIST_M = 100.0
POINTS_ROAD_ADJACENT = 5.0

# -------------------------------------------------------------
# Mitigation Factor: Water Bodies (Deduction up to -10 points)
# -------------------------------------------------------------
WATER_BARRIER_DIST_M = 500.0
POINTS_WATER_DEDUCTION = -10.0

# -------------------------------------------------------------
# NEW: Population Exposure (Max 15 points)
# -------------------------------------------------------------
POPULATION_HIGH_THRESHOLD = 500.0    # people per pixel
POINTS_HIGH_POPULATION = 15.0

# -------------------------------------------------------------
# NEW: Power Plant Hazard (Max 15 points)
# -------------------------------------------------------------
POWERPLANT_CRITICAL_DIST_M = 5000.0   # within 5 km
POINTS_POWERPLANT_CRITICAL = 15.0

# -------------------------------------------------------------
# NEW: FRP Anomaly (Z-Score) (Max 20 points)
# -------------------------------------------------------------
FRP_ZSCORE_HIGH = 2.5
POINTS_FRP_ZSCORE_HIGH = 20.0
FRP_ZSCORE_MODERATE = 1.5
POINTS_FRP_ZSCORE_MODERATE = 10.0

# -------------------------------------------------------------
# Cluster Density (Event Size / Spread Risk) (Max 20 points)
# -------------------------------------------------------------
CLUSTER_DENSITY_HIGH = 10      # more than 10 hotspots within 5 km
POINTS_CLUSTER_HIGH = 20.0
CLUSTER_DENSITY_MODERATE = 5
POINTS_CLUSTER_MODERATE = 10.0