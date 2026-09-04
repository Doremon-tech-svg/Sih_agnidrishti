""""
Main Feature Engineering class for AgniDrishti.
"""

from typing import Any, Dict, List, Optional
import pandas as pd

from ml.features.schema import (
    DEFAULT_MAX_DISTANCE_M,
    FEATURE_COLUMNS,
)
from ml.features.transformers import (
    FIRMSFeatureExtractor,
    LandCoverFeatureExtractor,
    OSMSpatialFeatureExtractor,
    NightfireFeatureExtractor,
    PowerPlantFeatureExtractor,
    WorldPopFeatureExtractor,
    ClusterDensityFeatureExtractor,   # <-- NEW
)


class FireFeatureEngineer:
    """
    Transforms unified fire events (FIRMS + LandCover + OSM + Nightfire + PowerPlants + WorldPop)
    into flat, numerical, normalized feature vectors.
    """

    def __init__(self, default_max_distance_m: float = DEFAULT_MAX_DISTANCE_M):
        self.default_max_distance_m = default_max_distance_m
        self.feature_columns = FEATURE_COLUMNS

    def transform_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a single unified fire record into an engineered feature vector.
        """
        # 1. FIRMS features
        firms_features = FIRMSFeatureExtractor.extract(record)

        # 2. LandCover features
        landcover_features = LandCoverFeatureExtractor.extract(
            record.get("landcover")
        )

        # 3. OSM spatial features
        osm_features = OSMSpatialFeatureExtractor.extract(
            record.get("osm"),
            default_max_distance_m=self.default_max_distance_m,
        )

        # 4. Nightfire features
        nightfire_features = NightfireFeatureExtractor.extract(
            record.get("nightfire")
        )

        # 5. Power plant features
        powerplant_features = PowerPlantFeatureExtractor.extract(
            record.get("powerplants")
        )

        # 6. WorldPop features
        worldpop_features = WorldPopFeatureExtractor.extract(
            record.get("worldpop")
        )

        # 7. Cluster density features
        cluster_density_features = ClusterDensityFeatureExtractor.extract(
            record.get("cluster_density")
        )

        # Merge all into flat feature dictionary
        features = {
            **firms_features,
            **landcover_features,
            **osm_features,
            **nightfire_features,
            **powerplant_features,
            **worldpop_features,
            **cluster_density_features,   # <-- NEW
        }

        return features

    def transform_records(
        self, records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Transform a list of unified fire records into engineered feature vectors.
        """
        return [self.transform_record(record) for record in records]

    def to_dataframe(
        self,
        records: List[Dict[str, Any]],
        columns: Optional[List[str]] = None,
    ) -> pd.DataFrame:
        """
        Transform records directly into a Pandas DataFrame formatted for ML or Risk Engine.
        """
        feature_list = self.transform_records(records)
        df = pd.DataFrame(feature_list)

        cols = columns or self.feature_columns
        # Ensure all required columns exist
        for col in cols:
            if col not in df.columns:
                df[col] = 0

        return df[cols]