from pathlib import Path

import rasterio


LANDCOVER_CLASSES = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse vegetation",
    70: "Snow and ice",
    80: "Permanent water bodies",
    90: "Herbaceous wetland",
    95: "Mangroves",
    100: "Moss and lichen",
}


class LandCoverExtractor:
    """
    Extracts ESA WorldCover information from multiple
    GeoTIFF tiles.
    """

    def __init__(self, landcover_directory):
        self.landcover_directory = Path(landcover_directory)
        self.datasets = {}

    def _find_tile(self, latitude, longitude):
        """
        Find the WorldCover tile containing the coordinate.
        """

        for raster_path in self.landcover_directory.glob("*.tif"):

            dataset = rasterio.open(raster_path)

            try:
                # Check whether coordinate falls inside raster bounds
                bounds = dataset.bounds

                if (
                    bounds.left <= longitude <= bounds.right
                    and bounds.bottom <= latitude <= bounds.top
                ):
                    return raster_path

            finally:
                dataset.close()

        return None

    def _open_tile(self, raster_path):
        """
        Open a raster tile and cache it for reuse.
        """

        raster_path = Path(raster_path)

        if raster_path not in self.datasets:
            self.datasets[raster_path] = rasterio.open(raster_path)

        return self.datasets[raster_path]

    def extract_landcover(self, latitude, longitude):
        """
        Extract land-cover information for a coordinate.
        """

        raster_path = self._find_tile(latitude, longitude)

        if raster_path is None:
            raise ValueError(
                f"No WorldCover tile found for "
                f"latitude={latitude}, longitude={longitude}"
            )

        dataset = self._open_tile(raster_path)

        row, col = dataset.index(longitude, latitude)

        value = dataset.read(1)[row, col]

        class_code = int(value)

        class_name = LANDCOVER_CLASSES.get(
            class_code,
            "Unknown"
        )

        return {
            "latitude": latitude,
            "longitude": longitude,
            "class_code": class_code,
            "class_name": class_name,
            "tile": raster_path.name,
        }

    def close(self):
        """
        Close all opened raster datasets.
        """

        for dataset in self.datasets.values():
            dataset.close()

        self.datasets.clear()