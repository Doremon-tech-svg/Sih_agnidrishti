"""
Feature Engineering module for AgniDrishti.
Transforms unified fire event records (FIRMS + LandCover + OSM) into structured,
normalized numerical feature vectors for the Risk Engine and ML models.
"""

from backend.app.features.engineer import FireFeatureEngineer

__all__ = ["FireFeatureEngineer"]
