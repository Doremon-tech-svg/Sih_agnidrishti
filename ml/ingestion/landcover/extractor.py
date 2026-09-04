from pathlib import Path
import rasterio
from rasterio.windows import Window


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
    Extracts ESA WorldCover information from multiple GeoTIFF tiles.
    Uses windowed reads for fast per-pixel access.
    """

    def __init__(self, landcover_directory):
        self.landcover_directory = Path(landcover_directory)
        self.datasets = []
        # Preload all tiles and cache dataset handles/bounds
        for raster_path in self.landcover_directory.glob("*.tif"):
            dataset = rasterio.open(raster_path)
            self.datasets.append({
                "path": raster_path,
                "dataset": dataset,
                "bounds": dataset.bounds,
            })

    def _find_tile(self, latitude, longitude):
        for item in self.datasets:
            bounds = item["bounds"]
            if (
                bounds.left <= longitude <= bounds.right
                and bounds.bottom <= latitude <= bounds.top
            ):
                return item
        return None

    def extract_landcover(self, latitude, longitude):
        tile = self._find_tile(latitude, longitude)
        if tile is None:
            raise ValueError(
                f"No WorldCover tile found for latitude={latitude}, longitude={longitude}"
            )

        dataset = tile["dataset"]
        row, col = dataset.index(longitude, latitude)
        row, col = int(row), int(col)

        # Read only the single pixel we need
        value = dataset.read(1, window=Window(col, row, 1, 1))[0, 0]
        class_code = int(value)
        class_name = LANDCOVER_CLASSES.get(class_code, "Unknown")

        return {
            "latitude": latitude,
            "longitude": longitude,
            "class_code": class_code,
            "class_name": class_name,
            "tile": tile["path"].name,
        }

    def close(self):
        for item in self.datasets:
            item["dataset"].close()
        self.datasets.clear()