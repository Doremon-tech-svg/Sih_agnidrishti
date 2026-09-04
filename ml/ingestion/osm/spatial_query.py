from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point


class OSMSpatialQuery:
    """
    Perform spatial queries on preprocessed OSM road data.
    """

    def __init__(self, geojson_file):
        self.geojson_file = Path(geojson_file)

        if not self.geojson_file.exists():
            raise FileNotFoundError(
                f"GeoJSON file not found: {self.geojson_file}"
            )

        self.roads = gpd.read_file(self.geojson_file)

        if self.roads.empty:
            raise ValueError(
                f"No road features found in {self.geojson_file}"
            )

        # Keep everything in a projected CRS for distance calculations.
        self.roads = self.roads.to_crs(epsg=32643)

    def nearby_roads(
        self,
        latitude,
        longitude,
        radius_meters=1000
    ):
        """
        Find roads within radius_meters of a coordinate.

        Returns:
            Dictionary containing nearby road information.
        """

        point = gpd.GeoSeries(
            [Point(longitude, latitude)],
            crs="EPSG:4326"
        ).to_crs(epsg=32643).iloc[0]

        distances = self.roads.geometry.distance(point)

        nearby = self.roads[
            distances <= radius_meters
        ].copy()

        nearby["distance_m"] = distances[
            nearby.index
        ]

        nearby = nearby.sort_values(
            "distance_m"
        )

        result = {
            "latitude": latitude,
            "longitude": longitude,
            "radius_meters": radius_meters,
            "road_count": len(nearby),
            "nearest_road": None,
            "nearest_road_distance_m": None,
        }

        if not nearby.empty:

            nearest = nearby.iloc[0]

            road_name = nearest.get("name")

            if road_name is None or str(road_name).lower() == "nan":
                 road_name = nearest.get("highway", "Unnamed road")

            result["nearest_road"] = road_name

            result["nearest_road_distance_m"] = round(
                float(nearest["distance_m"]),
                2
            )
           

        return result
    def close(self):
        
        """
        Release loaded road data.
        """
        self.roads = None