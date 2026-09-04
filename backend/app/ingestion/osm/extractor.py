from pathlib import Path

from pyrosm import OSM


class OSMExtractor:
    """
    Extract OpenStreetMap road features around geographic locations.
    """

    def __init__(self, osm_file):
        self.osm_file = Path(osm_file)

        if not self.osm_file.exists():
            raise FileNotFoundError(
                f"OSM file not found: {self.osm_file}"
            )

        self.osm = None

    def extract_area(self, west, south, east, north):
        """
        Extract driving roads inside a bounding box.

        The bounding box is passed when creating the Pyrosm OSM
        object because get_network() does not accept bounding_box.
        """

        bounding_box = [
            west,
            south,
            east,
            north
        ]

        osm = OSM(
            str(self.osm_file),
            bounding_box=bounding_box
        )

        return osm.get_network(
            network_type="driving"
        )

    def extract_roads_around_point(
        self,
        latitude,
        longitude,
        radius=0.05
    ):
        """
        Extract driving roads around a point.

        radius is approximately measured in degrees.
        """

        west = longitude - radius
        south = latitude - radius
        east = longitude + radius
        north = latitude + radius

        return self.extract_area(
            west=west,
            south=south,
            east=east,
            north=north
        )

    def close(self):
        """
        Release resources.
        """

        self.osm = None