import pandas as pd


class NightfireNormalizer:
    """
    Normalizes Nightfire records into a consistent format for spatial matching.
    """

    def normalize(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        # Keep only needed columns
        cols = ["latitude", "longitude", "avg_temp_k", "type", "detection_freq_2024"]
        # Ensure columns exist
        for col in cols:
            if col not in df.columns:
                df[col] = None
        df = df[cols]
        # Convert detection freq to numeric, fill missing with 0
        df["detection_freq_2024"] = pd.to_numeric(df["detection_freq_2024"], errors="coerce").fillna(0.0)
        return df