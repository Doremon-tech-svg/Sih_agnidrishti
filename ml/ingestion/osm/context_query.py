from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point

from ml.ingestion.osm.spatial_query import OSMSpatialQuery


class OSMContextQuery:
    def __init__(self, roads_geojson, buildings_geojson=None, landuse_geojson=None):
        self.roads = OSMSpatialQuery(roads_geojson)
        self.buildings = gpd.read_file(buildings_geojson) if buildings_geojson and Path(buildings_geojson).exists() else None
        self.landuse = gpd.read_file(landuse_geojson) if landuse_geojson and Path(landuse_geojson).exists() else None

    def _distance_summary(self, features, point, radius_meters):
        if features is None or features.empty:
            return {"count": 0, "nearest_distance_m": None}
        features = features.to_crs(epsg=32643)
        distances = features.geometry.distance(point)
        nearby = features[distances <= radius_meters].copy()
        if nearby.empty:
            return {"count": 0, "nearest_distance_m": None}
        return {
            "count": len(nearby),
            "nearest_distance_m": round(float(distances[nearby.index].min()), 2)
        }

    def query(self, latitude, longitude, radius_meters=1000, radius_degrees=0.05):
        point = gpd.GeoSeries([Point(longitude, latitude)], crs="EPSG:4326").to_crs(epsg=32643).iloc[0]

        road_data = self.roads.nearby_roads(latitude, longitude, radius_meters)

        building_summary = self._distance_summary(self.buildings, point, radius_meters)
        settlement_summary = {"count": 0, "nearest_distance_m": None}
        industrial_summary = {"count": 0, "nearest_distance_m": None}
        water_summary = {"count": 0, "nearest_distance_m": None}

        if self.landuse is not None:
            residential = self.landuse[self.landuse["landuse"] == "residential"].copy()
            settlement_summary = self._distance_summary(residential, point, radius_meters)
            industrial = self.landuse[self.landuse["landuse"] == "industrial"].copy()
            industrial_summary = self._distance_summary(industrial, point, radius_meters)

        # POI and landuse counts: we don't have POIs in GeoJSON, set 0 for now
        return {
            "latitude": latitude,
            "longitude": longitude,
            "nearest_road": road_data.get("nearest_road"),
            "nearest_road_distance_m": road_data.get("nearest_road_distance_m"),
            "nearby_roads": road_data.get("road_count", 0),
            "buildings": building_summary,
            "settlements": settlement_summary,
            "industrial_areas": industrial_summary,
            "water_bodies": water_summary,
            "poi_count": 0,
            "landuse_count": len(self.landuse) if self.landuse is not None else 0,
        }

    def close(self):
        self.roads.close()
        self.buildings = None
        self.landuse = None