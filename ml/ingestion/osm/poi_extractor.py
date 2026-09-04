from pathlib import Path

import geopandas as gpd
from pyrosm import OSM
from shapely.geometry import Point


class OSMPOIExtractor:
    """
    Extract useful OSM POIs and land-use information
    around a geographic location.
    """

    def __init__(self, osm_file):
        self.osm_file = Path(osm_file)

        if not self.osm_file.exists():
            raise FileNotFoundError(
                f"OSM file not found: {self.osm_file}"
            )

    def _get_bbox(
        self,
        latitude,
        longitude,
        radius=0.05
    ):
        """
        Create an approximate geographic bounding box.

        radius is expressed in degrees.
        """

        return [
            longitude - radius,
            latitude - radius,
            longitude + radius,
            latitude + radius,
        ]

    def extract_pois(
        self,
        latitude,
        longitude,
        radius=0.05
    ):
        """
        Extract OSM points of interest around a coordinate.
        """

        bounding_box = self._get_bbox(
            latitude,
            longitude,
            radius
        )

        osm = OSM(
            str(self.osm_file),
            bounding_box=bounding_box
        )

        pois = osm.get_pois()

        if pois is None or pois.empty:
            return gpd.GeoDataFrame()

        return pois

    def extract_landuse(
        self,
        latitude,
        longitude,
        radius=0.05
    ):
        """
        Extract OSM land-use polygons around a coordinate.
        """

        bounding_box = self._get_bbox(
            latitude,
            longitude,
            radius
        )

        osm = OSM(
            str(self.osm_file),
            bounding_box=bounding_box
        )

        landuse = osm.get_landuse()

        if landuse is None or landuse.empty:
            return gpd.GeoDataFrame()

        return landuse

    def summarize_nearby_features(
        self,
        latitude,
        longitude,
        radius_meters=1000,
        radius_degrees=0.05
    ):
        """
        Summarize useful OSM features around a coordinate.
        """

        pois = self.extract_pois(
            latitude,
            longitude,
            radius_degrees
        )

        landuse = self.extract_landuse(
            latitude,
            longitude,
            radius_degrees
        )

        point = gpd.GeoSeries(
            [Point(longitude, latitude)],
            crs="EPSG:4326"
        ).to_crs(epsg=32643).iloc[0]

        if not pois.empty:
            pois = pois.to_crs(epsg=32643)

            poi_distances = pois.geometry.distance(point)

            nearby_pois = pois[
                poi_distances <= radius_meters
            ].copy()

        else:
            nearby_pois = pois

        if not landuse.empty:
            landuse = landuse.to_crs(epsg=32643)

            landuse_distances = landuse.geometry.distance(point)

            nearby_landuse = landuse[
                landuse_distances <= radius_meters
            ].copy()

        else:
            nearby_landuse = landuse

        return {
            "latitude": latitude,
            "longitude": longitude,
            "radius_meters": radius_meters,
            "poi_count": len(nearby_pois),
            "landuse_count": len(nearby_landuse),
            "pois": nearby_pois,
            "landuse": nearby_landuse,
        }