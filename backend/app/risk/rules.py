"""
Rule definitions, scoring thresholds, and reasoning templates for the AgniDrishti Risk Engine.
"""

# -------------------------------------------------------------
# Risk Level Boundaries
# -------------------------------------------------------------
RISK_LEVEL_LOW_MAX = 35.0
RISK_LEVEL_MEDIUM_MAX = 70.0
# Anything above 70.0 is HIGH / CRITICAL

# -------------------------------------------------------------
# Pillar 1: Fire Severity & Reliability (Max 30 points)
# -------------------------------------------------------------
FRP_HIGH_THRESHOLD = 30.0       # MW
FRP_MEDIUM_THRESHOLD = 10.0     # MW

POINTS_FRP_HIGH = 20.0
POINTS_FRP_MEDIUM = 12.0
POINTS_FRP_LOW = 5.0

CONFIDENCE_HIGH_THRESHOLD = 0.8
POINTS_HIGH_CONFIDENCE = 5.0

POINTS_NIGHT_FIRE = 5.0

# -------------------------------------------------------------
# Pillar 2: Industrial & High-Hazard Proximity (Max 25 points)
# -------------------------------------------------------------
INDUSTRIAL_CRITICAL_DIST_M = 500.0
INDUSTRIAL_WARNING_DIST_M = 1000.0

POINTS_INDUSTRIAL_CRITICAL = 25.0
POINTS_INDUSTRIAL_WARNING = 15.0

# -------------------------------------------------------------
# Pillar 3: Human Vulnerability & Settlements (Max 25 points)
# -------------------------------------------------------------
SETTLEMENT_CRITICAL_DIST_M = 300.0
SETTLEMENT_WARNING_DIST_M = 500.0

POINTS_SETTLEMENT_CRITICAL = 15.0
POINTS_SETTLEMENT_WARNING = 10.0

BUILDING_COUNT_HIGH_THRESHOLD = 5
POINTS_BUILDINGS_HIGH = 10.0
POINTS_BUILDINGS_MODERATE = 5.0

# -------------------------------------------------------------
# Pillar 4: Fuel Availability & Spread Risk (Max 20 points)
# -------------------------------------------------------------
POINTS_VEGETATION_FUEL = 15.0
POINTS_CROPLAND_FUEL = 10.0

ROAD_ADJACENT_DIST_M = 100.0
POINTS_ROAD_ADJACENT = 5.0

# -------------------------------------------------------------
# Mitigation Factor: Water Bodies (Deduction up to -10 points)
# -------------------------------------------------------------
WATER_BARRIER_DIST_M = 500.0
POINTS_WATER_DEDUCTION = -10.0


# -------------------------------------------------------------
# Pillar 5: Gas Signature Verification (Agent 2 — SO2/NO2)
# Adjustment only, not an independent max like the other pillars —
# it moves the score up or down based on how well atmospheric gas
# evidence agrees with the ML classification.
# -------------------------------------------------------------
POINTS_GAS_SOLIDIFIED = 15.0      # agent2_status == "SOLIDIFIED"
POINTS_GAS_SUPPORTED = 8.0        # agent2_status == "SUPPORTED"
POINTS_GAS_CONTRADICTION = -15.0  # agent2_status == "CONTRADICTION"