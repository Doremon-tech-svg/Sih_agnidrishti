import rasterio
from rasterio.windows import Window
from pathlib import Path


class WorldPopExtractor:
    """
    Extracts population density from a WorldPop GeoTIFF.
    Uses windowed reads for fast repeated access.
    """

    def __init__(self, tif_path):
        self.tif_path = Path(tif_path)
        if not self.tif_path.exists():
            raise FileNotFoundError(f"WorldPop file not found: {self.tif_path}")
        self.dataset = rasterio.open(self.tif_path)

    def get_population(self, lat, lon):
        # Check if coordinate is within raster bounds
        if not (self.dataset.bounds.left <= lon <= self.dataset.bounds.right and
                self.dataset.bounds.bottom <= lat <= self.dataset.bounds.top):
            return 0.0
        row, col = self.dataset.index(lon, lat)
        row, col = int(row), int(col)
        value = self.dataset.read(1, window=Window(col, row, 1, 1))[0, 0]
        return float(value)

    def close(self):
        self.dataset.close()