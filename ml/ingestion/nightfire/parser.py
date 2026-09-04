import pandas as pd
from pathlib import Path


class NightfireParser:
    """
    Parser for VIIRS Nightfire CSV exports (the format we have).
    """

    def __init__(self, csv_path):
        self.csv_path = Path(csv_path)
        if not self.csv_path.exists():
            raise FileNotFoundError(f"Nightfire file not found: {self.csv_path}")

    def parse(self) -> pd.DataFrame:
        df = pd.read_csv(self.csv_path)
        # Standardize column names (based on provided file)
        df = df.rename(columns={
            "Latitude": "latitude",
            "Longitude": "longitude",
            "Avg temp., K": "avg_temp_k",
            "Type": "type",
            "BCM 2023": "bcm_2023",
            "BCM 2024": "bcm_2024",
            "Detection freq. 2024": "detection_freq_2024",
        })
        # Drop rows with missing coordinates
        df = df.dropna(subset=["latitude", "longitude"])
        return df