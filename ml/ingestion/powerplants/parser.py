import pandas as pd
from pathlib import Path


class PowerPlantParser:
    """
    Parser for WRI Global Power Plant Database CSV (or any CSV with lat/lon/capacity).
    """

    def __init__(self, csv_path):
        self.csv_path = Path(csv_path)
        if not self.csv_path.exists():
            raise FileNotFoundError(f"Power plant file not found: {self.csv_path}")

    def parse(self) -> pd.DataFrame:
        df = pd.read_csv(self.csv_path)
        # Standardize column names
        rename_map = {
            "latitude": "latitude",
            "longitude": "longitude",
            "capacity_mw": "capacity_mw",
            "name": "name",
            "primary_fuel": "primary_fuel",
        }
        # In WRI, columns are: country, country_long, name, gppd_idnr, capacity_mw, latitude, longitude, primary_fuel, ...
        # We'll assume standard names; if different, user can adjust.
        df = df.rename(columns=rename_map)
        # Ensure required columns exist
        required = ["latitude", "longitude", "capacity_mw"]
        for col in required:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        df = df.dropna(subset=["latitude", "longitude"])
        return df