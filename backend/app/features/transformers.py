"""
Extractors and transformers for AgniDrishti unified fire records.
Handles cleaning, imputation, and numerical transformations across FIRMS, LandCover, and OSM data.
"""

from datetime import datetime, date
from typing import Any, Dict

from backend.app.features.schema import (
    BARE_LAND_CLASS_CODES,
    BUILT_UP_CLASS_CODES,
    CONFIDENCE_MAPPING,
    CROPLAND_CLASS_CODES,
    DEFAULT_MAX_DISTANCE_M,
    INDUSTRIAL_PROXIMITY_THRESHOLD_M,
    ROAD_PROXIMITY_THRESHOLD_M,
    SETTLEMENT_PROXIMITY_THRESHOLD_M,
    VEGETATION_CLASS_CODES,
    WATER_CLASS_CODES,
    WATER_PROXIMITY_THRESHOLD_M,
)


class FIRMSFeatureExtractor:
    """Extracts and normalizes satellite fire detection features."""

    @staticmethod
    def extract(record: Dict[str, Any]) -> Dict[str, Any]:
        # Latitude / Longitude
        latitude = float(record.get("latitude", 0.0))
        longitude = float(record.get("longitude", 0.0))

        # Temporal features
        acq_date = record.get("acquisition_date") or record.get("acq_date")
        raw_time = record.get("acquisition_time") or record.get("acq_time") or "00:00"
        acq_time = str(raw_time).strip()

        month = 1
        if isinstance(acq_date, (date, datetime)):
            month = acq_date.month
        elif isinstance(acq_date, str):
            try:
                month = datetime.strptime(acq_date[:10], "%Y-%m-%d").month
            except ValueError:
                month = 1

        hour = 0
        if ":" in acq_time:
            try:
                hour = int(acq_time.split(":")[0])
            except ValueError:
                hour = 0
        else:
            # Handle formats like "842" or "2130"
            padded = acq_time.zfill(4)
            try:
                hour = int(padded[:2])
            except ValueError:
                hour = 0

        # Day/Night flag
        daynight = str(record.get("daynight", "D")).upper()
        is_night = 1 if daynight == "N" else 0

        # FRP (Fire Radiative Power)
        try:
            frp = float(record.get("frp", 0.0))
        except (ValueError, TypeError):
            frp = 0.0

        # Brightness (support bright_ti4, bright_ti5, or brightness)
        brightness_candidates = []
        for key in ("bright_ti4", "bright_ti5", "brightness"):
            val = record.get(key)
            if val is not None:
                try:
                    brightness_candidates.append(float(val))
                except (ValueError, TypeError):
                    pass

        brightness = max(brightness_candidates) if brightness_candidates else 300.0

        # Confidence (normalize to 0.0 - 1.0)
        raw_conf = record.get("confidence")
        confidence_score = 0.5  # default neutral confidence
        if raw_conf is not None:
            raw_conf_str = str(raw_conf).strip().lower()
            if raw_conf_str in CONFIDENCE_MAPPING:
                confidence_score = CONFIDENCE_MAPPING[raw_conf_str]
            else:
                try:
                    num_conf = float(raw_conf)
                    confidence_score = max(0.0, min(1.0, num_conf / 100.0))
                except ValueError:
                    confidence_score = 0.5

        # Scan and Track
        try:
            scan = float(record.get("scan", 1.0))
        except (ValueError, TypeError):
            scan = 1.0

        try:
            track = float(record.get("track", 1.0))
        except (ValueError, TypeError):
            track = 1.0

        return {
            "latitude": round(latitude, 5),
            "longitude": round(longitude, 5),
            "acquisition_hour": hour,
            "acquisition_month": month,
            "is_night": is_night,
            "frp": round(frp, 2),
            "brightness": round(brightness, 2),
            "confidence_score": round(confidence_score, 3),
            "scan": round(scan, 2),
            "track": round(track, 2),
        }


class LandCoverFeatureExtractor:
    """Extracts categorical and binary fuel/environmental indicators."""

    @staticmethod
    def extract(landcover: Any) -> Dict[str, Any]:
        if not landcover or not isinstance(landcover, dict):
            return {
                "landcover_code": 0,
                "is_cropland": 0,
                "is_vegetation": 0,
                "is_built_up": 0,
                "is_water": 0,
                "is_bare_land": 0,
            }

        class_code = int(landcover.get("class_code", 0))

        return {
            "landcover_code": class_code,
            "is_cropland": 1 if class_code in CROPLAND_CLASS_CODES else 0,
            "is_vegetation": 1 if class_code in VEGETATION_CLASS_CODES else 0,
            "is_built_up": 1 if class_code in BUILT_UP_CLASS_CODES else 0,
            "is_water": 1 if class_code in WATER_CLASS_CODES else 0,
            "is_bare_land": 1 if class_code in BARE_LAND_CLASS_CODES else 0,
        }


class OSMSpatialFeatureExtractor:
    """Extracts spatial distance, density, and proximity indicators from OSM context."""

    @staticmethod
    def extract(
        osm: Any,
        default_max_distance_m: float = DEFAULT_MAX_DISTANCE_M,
    ) -> Dict[str, Any]:
        if not osm or not isinstance(osm, dict):
            return {
                "nearest_road_distance_m": default_max_distance_m,
                "nearby_road_count": 0,
                "is_road_adjacent": 0,
                "building_count": 0,
                "nearest_building_distance_m": default_max_distance_m,
                "has_nearby_buildings": 0,
                "settlement_count": 0,
                "nearest_settlement_distance_m": default_max_distance_m,
                "is_near_settlement": 0,
                "industrial_count": 0,
                "nearest_industrial_distance_m": default_max_distance_m,
                "is_near_industrial": 0,
                "water_body_count": 0,
                "nearest_water_distance_m": default_max_distance_m,
                "has_nearby_water": 0,
                "poi_count": 0,
                "landuse_count": 0,
            }

        # Road features
        raw_road_dist = osm.get("nearest_road_distance_m")
        road_distance = (
            float(raw_road_dist)
            if raw_road_dist is not None
            else default_max_distance_m
        )
        nearby_road_count = int(osm.get("nearby_roads", 0))
        is_road_adjacent = 1 if road_distance <= ROAD_PROXIMITY_THRESHOLD_M else 0

        # Buildings
        buildings = osm.get("buildings") or {}
        b_count = int(buildings.get("count", 0))
        raw_b_dist = buildings.get("nearest_distance_m")
        building_distance = (
            float(raw_b_dist)
            if raw_b_dist is not None
            else default_max_distance_m
        )
        has_nearby_buildings = 1 if b_count > 0 else 0

        # Settlements / Residential
        settlements = osm.get("settlements") or {}
        s_count = int(settlements.get("count", 0))
        raw_s_dist = settlements.get("nearest_distance_m")
        settlement_distance = (
            float(raw_s_dist)
            if raw_s_dist is not None
            else default_max_distance_m
        )
        is_near_settlement = (
            1 if settlement_distance <= SETTLEMENT_PROXIMITY_THRESHOLD_M else 0
        )

        # Industrial
        industrial = osm.get("industrial_areas") or {}
        ind_count = int(industrial.get("count", 0))
        raw_ind_dist = industrial.get("nearest_distance_m")
        industrial_distance = (
            float(raw_ind_dist)
            if raw_ind_dist is not None
            else default_max_distance_m
        )
        is_near_industrial = (
            1 if industrial_distance <= INDUSTRIAL_PROXIMITY_THRESHOLD_M else 0
        )

        # Water bodies
        water = osm.get("water_bodies") or {}
        w_count = int(water.get("count", 0))
        raw_w_dist = water.get("nearest_distance_m")
        water_distance = (
            float(raw_w_dist)
            if raw_w_dist is not None
            else default_max_distance_m
        )
        has_nearby_water = (
            1 if w_count > 0 or water_distance <= WATER_PROXIMITY_THRESHOLD_M else 0
        )

        # POI & Landuse counts
        poi_count = int(osm.get("poi_count", 0))
        landuse_count = int(osm.get("landuse_count", 0))

        return {
            "nearest_road_distance_m": round(road_distance, 2),
            "nearby_road_count": nearby_road_count,
            "is_road_adjacent": is_road_adjacent,
            "building_count": b_count,
            "nearest_building_distance_m": round(building_distance, 2),
            "has_nearby_buildings": has_nearby_buildings,
            "settlement_count": s_count,
            "nearest_settlement_distance_m": round(settlement_distance, 2),
            "is_near_settlement": is_near_settlement,
            "industrial_count": ind_count,
            "nearest_industrial_distance_m": round(industrial_distance, 2),
            "is_near_industrial": is_near_industrial,
            "water_body_count": w_count,
            "nearest_water_distance_m": round(water_distance, 2),
            "has_nearby_water": has_nearby_water,
            "poi_count": poi_count,
            "landuse_count": landuse_count,
        }
