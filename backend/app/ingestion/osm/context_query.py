from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

from backend.app.ingestion.osm.spatial_query import OSMSpatialQuery
from backend.app.ingestion.osm.poi_extractor import OSMPOIExtractor


class OSMContextQuery:
    """
    Build a structured OSM context summary around a FIRMS hotspot.

    Combines:
    - road information
    - POIs
    - buildings
    - land-use features
    """

    def __init__(self, osm_file, road_geojson):
        self.osm_file = Path(osm_file)
        self.road_geojson = Path(road_geojson)

        if not self.osm_file.exists():
            raise FileNotFoundError(
                f"OSM file not found: {self.osm_file}"
            )

        if not self.road_geojson.exists():
            raise FileNotFoundError(
                f"Road GeoJSON not found: {self.road_geojson}"
            )

        self.roads = OSMSpatialQuery(
            self.road_geojson
        )

        self.poi_extractor = OSMPOIExtractor(
            self.osm_file
        )

    def _distance_summary(
        self,
        features,
        point,
        radius_meters,
        category
    ):
        """
        Calculate count and nearest distance for
        a selected category of OSM features.
        """

        if features is None or features.empty:
            return {
                "count": 0,
                "nearest_distance_m": None
            }

        features = features.to_crs(epsg=32643)

        distances = features.geometry.distance(point)

        nearby = features[
            distances <= radius_meters
        ].copy()

        if nearby.empty:
            return {
                "count": 0,
                "nearest_distance_m": None
            }

        return {
            "count": len(nearby),
            "nearest_distance_m": round(
                float(distances[nearby.index].min()),
                2
            )
        }

    def query(
        self,
        latitude,
        longitude,
        radius_meters=1000,
        radius_degrees=0.05
    ):
        """
        Generate structured OSM context around a hotspot.
        """

        point = gpd.GeoSeries(
            [Point(longitude, latitude)],
            crs="EPSG:4326"
        ).to_crs(epsg=32643).iloc[0]

        # -----------------------------
        # 1. Roads
        # -----------------------------

        road_data = self.roads.nearby_roads(
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters
        )

        # -----------------------------
        # 2. Raw POIs
        # -----------------------------

        pois = self.poi_extractor.extract_pois(
            latitude=latitude,
            longitude=longitude,
            radius=radius_degrees
        )

        # -----------------------------
        # 3. Raw land-use
        # -----------------------------

        landuse = self.poi_extractor.extract_landuse(
            latitude=latitude,
            longitude=longitude,
            radius=radius_degrees
        )

        # -----------------------------
        # 4. Buildings
        # -----------------------------

        buildings = gpd.GeoDataFrame()

        if not pois.empty and "building" in pois.columns:
            buildings = pois[
                pois["building"].notna()
            ].copy()

        building_summary = self._distance_summary(
            buildings,
            point,
            radius_meters,
            "buildings"
        )

        # -----------------------------
        # 5. Residential / settlements
        # -----------------------------

        residential = gpd.GeoDataFrame()

        if not landuse.empty and "landuse" in landuse.columns:
            residential = landuse[
                landuse["landuse"] == "residential"
            ].copy()

        settlement_summary = self._distance_summary(
            residential,
            point,
            radius_meters,
            "settlements"
        )

        # -----------------------------
        # 6. Industrial areas
        # -----------------------------

        industrial = gpd.GeoDataFrame()

        if not landuse.empty and "landuse" in landuse.columns:
            industrial = landuse[
                landuse["landuse"] == "industrial"
            ].copy()

        industrial_summary = self._distance_summary(
            industrial,
            point,
            radius_meters,
            "industrial"
        )

        # -----------------------------
        # 7. Water-related POIs
        # -----------------------------

        water = gpd.GeoDataFrame()

        if not pois.empty:
            water_values = {
                "water",
                "swimming_pool",
                "reservoir",
                "lake"
            }

            masks = []

            for column in [
                "amenity",
                "tourism",
                "shop"
            ]:
                if column in pois.columns:
                    masks.append(
                        pois[column].isin(water_values)
                    )

            if masks:
                water_mask = masks[0]

                for mask in masks[1:]:
                    water_mask = water_mask | mask

                water = pois[water_mask].copy()

        water_summary = self._distance_summary(
            water,
            point,
            radius_meters,
            "water"
        )

        # -----------------------------
        # 8. Return unified context
        # -----------------------------

        return {
            "latitude": latitude,
            "longitude": longitude,

            "nearest_road": road_data.get(
                "nearest_road"
            ),

            "nearest_road_distance_m": road_data.get(
                "nearest_road_distance_m"
            ),

            "nearby_roads": road_data.get(
                "road_count",
                0
            ),

            "buildings": building_summary,

            "settlements": settlement_summary,

            "industrial_areas": industrial_summary,

            "water_bodies": water_summary,

            "poi_count": len(pois),

            "landuse_count": len(landuse),
        }

    def close(self):
        """
        Release resources.
        """

        self.roads.close()
        self.poi_extractor = None