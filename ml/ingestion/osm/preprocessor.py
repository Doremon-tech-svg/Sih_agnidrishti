from pathlib import Path

import geopandas as gpd
from pyrosm import OSM


class OSMPreprocessor:
    """
    Preprocess raw OSM data into a smaller application-ready dataset.
    """

    def __init__(self, osm_file, output_directory):
        self.osm_file = Path(osm_file)
        self.output_directory = Path(output_directory)

        if not self.osm_file.exists():
            raise FileNotFoundError(
                f"OSM file not found: {self.osm_file}"
            )

        self.output_directory.mkdir(
            parents=True,
            exist_ok=True
        )

    def extract_roads(
        self,
        west,
        south,
        east,
        north
    ):
        """
        Extract driving roads inside a bounding box.
        """

        bounding_box = [
            west,
            south,
            east,
            north
        ]

        print("Opening OSM file...")

        osm = OSM(
            str(self.osm_file),
            bounding_box=bounding_box
        )

        print("Extracting roads...")

        roads = osm.get_network(
            network_type="driving"
        )

        return roads

    def clean_roads(self, roads):
        """
        Keep only columns useful for AgniDrishti.
        """

        useful_columns = [
            "osm_id",
            "highway",
            "name",
            "maxspeed",
            "lanes",
            "surface",
            "geometry"
        ]

        available_columns = [
            column
            for column in useful_columns
            if column in roads.columns
        ]

        roads = roads[available_columns].copy()

        # Remove features without geometry
        roads = roads[
            roads.geometry.notna()
        ]

        # Remove duplicate OSM features
        if "osm_id" in roads.columns:
            roads = roads.drop_duplicates(
                subset=["osm_id"]
            )

        return roads

    def save_geojson(self, roads, filename):
        """
        Save processed roads as GeoJSON.
        """

        output_path = (
            self.output_directory
            / filename
        )

        roads.to_file(
            output_path,
            driver="GeoJSON"
        )

        return output_path