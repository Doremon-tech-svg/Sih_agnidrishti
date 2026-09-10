"""Gas Detector Analyzer - Agent 2 for SO2/NO2 verification."""

from typing import Any, Dict, Optional, Tuple
import logging
from datetime import datetime, timedelta
import numpy as np

logger = logging.getLogger(__name__)


class GasDetectorAnalyzer:
    """
    Verifies ML classification using atmospheric SO2/NO2 concentrations.
    
    Refines threat classification by checking if gas signatures match
    the ML-predicted threat class.
    """

    # Threat class → Expected gas concentration ranges (ppb)
    GAS_THREAT_SIGNATURES = {
        0: {  # Controlled / Low Risk Thermal Activity
            "so2_range": (0, 100),
            "no2_range": (0, 50),
            "confidence_boost": -0.15,
            "description": "No/low industrial emissions expected"
        },
        1: {  # Agricultural / Stubble Burning (Cropland)
            "so2_range": (0, 150),
            "no2_range": (50, 250),
            "confidence_boost": +0.20,
            "description": "Biomass burning signature (high NO2, low SO2)"
        },
        2: {  # Wildfire / Vegetation Fuel Fire
            "so2_range": (0, 200),
            "no2_range": (100, 400),
            "confidence_boost": +0.25,
            "description": "Pure combustion signature (high NO2, minimal SO2)"
        },
        3: {  # Critical Industrial Hazard Fire (Refineries/Chemical)
            "so2_range": (150, 2000),
            "no2_range": (100, 600),
            "confidence_boost": +0.40,
            "description": "Industrial emission signature (both SO2 and NO2 elevated)"
        }
    }

    # Penalty factors for mismatches
    PENALTIES = {
        "so2_out_of_range": -0.15,
        "no2_out_of_range": -0.15,
        "no_gas_elevation": -0.10,  # Both gases below thresholds
        "contradicts_class": -0.25,  # Gas signature contradicts predicted class
    }

    def __init__(self, data_fetcher=None, enable_caching: bool = True):
        """
        Initialize Gas Detector Analyzer.
        
        Args:
            data_fetcher: GasDataFetcher instance (injected for testing)
            enable_caching: Cache gas data for performance
        """
        self.data_fetcher = data_fetcher or GasDataFetcher()
        self.enable_caching = enable_caching
        self._gas_cache = {}  # {(lat, lon, date): gas_data}

    def analyze_hotspot(
        self,
        hotspot_record: Dict[str, Any],
        ml_classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Verify and refine ML classification using gas concentration data.
        
        Args:
            hotspot_record: {
                "latitude": float,
                "longitude": float,
                "acquisition_date": str (YYYY-MM-DD or datetime),
                "confidence_score": float [0-1],
                "frp": float,
                ...
            }
            ml_classification: {
                "threat_class": int [0-3],
                "probability": float [0-1],
                "predicted_label": str
            }
        
        Returns:
            {
                "refined_class": int,
                "refined_probability": float,
                "gas_analysis": {
                    "so2_ppb": float,
                    "no2_ppb": float,
                    "so2_status": str,
                    "no2_status": str,
                    "gas_signature_match": float [0-1],
                    "data_source": str
                },
                "confidence_delta": float,
                "recommendation": str,
                "flags": list,
                "agent2_status": "SOLIDIFIED" | "INCONCLUSIVE" | "CONTRADICTION"
            }
        """
        lat = hotspot_record.get("latitude")
        lon = hotspot_record.get("longitude")
        acq_date = hotspot_record.get("acquisition_date")

        if not all([lat, lon, acq_date]):
            return self._no_gas_data_response(ml_classification)

        # Fetch gas data
        gas_data = self._fetch_gas_data_cached(lat, lon, acq_date)
        if gas_data is None:
            logger.warning(
                f"Could not fetch gas data for ({lat}, {lon}) on {acq_date}"
            )
            return self._no_gas_data_response(ml_classification)

        # Analyze gas signature
        so2_ppb = gas_data.get("so2_ppb", 0)
        no2_ppb = gas_data.get("no2_ppb", 0)
        predicted_class = ml_classification["threat_class"]

        # Compute signature match
        signature_match = self._compute_gas_signature_match(
            so2_ppb, no2_ppb, predicted_class
        )

        # Refine classification
        refined_prob, confidence_delta, recommendation = self._refine_classification(
            ml_classification["probability"],
            signature_match,
            predicted_class,
            so2_ppb,
            no2_ppb
        )

        # Determine agent status
        agent_status = self._determine_agent_status(
            signature_match, confidence_delta, predicted_class
        )

        # Assess SO2/NO2 levels
        so2_status = self._assess_gas_level(
            so2_ppb,
            self.GAS_THREAT_SIGNATURES[predicted_class]["so2_range"]
        )
        no2_status = self._assess_gas_level(
            no2_ppb,
            self.GAS_THREAT_SIGNATURES[predicted_class]["no2_range"]
        )

        return {
            "refined_class": predicted_class,
            "refined_probability": refined_prob,
            "gas_analysis": {
                "so2_ppb": round(so2_ppb, 2),
                "no2_ppb": round(no2_ppb, 2),
                "so2_status": so2_status,
                "no2_status": no2_status,
                "gas_signature_match": round(signature_match, 3),
                "data_source": gas_data.get("data_source", "unknown"),
                "measurement_time": gas_data.get("measurement_time", "unknown")
            },
            "confidence_delta": round(confidence_delta, 3),
            "original_ml_probability": round(ml_classification["probability"], 3),
            "recommendation": recommendation,
            "agent2_status": agent_status,
            "flags": self._generate_flags(
                so2_ppb, no2_ppb, signature_match, predicted_class
            ),
            "threat_class_description": self.GAS_THREAT_SIGNATURES[predicted_class]["description"]
        }

    def _fetch_gas_data_cached(
        self, lat: float, lon: float, acq_date: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch gas data with caching."""
        # Normalize date
        if isinstance(acq_date, str):
            acq_date = acq_date.split("T")[0]  # Take just YYYY-MM-DD

        cache_key = (round(lat, 2), round(lon, 2), acq_date)

        if self.enable_caching and cache_key in self._gas_cache:
            return self._gas_cache[cache_key]

        gas_data = self.data_fetcher.fetch(lat, lon, acq_date)

        if self.enable_caching and gas_data:
            self._gas_cache[cache_key] = gas_data

        return gas_data

    def _compute_gas_signature_match(
        self, so2_ppb: float, no2_ppb: float, threat_class: int
    ) -> float:
        """
        Compute [0-1] score of how well observed gases match expected signature.
        
        1.0 = Perfect match with expected ranges
        0.5 = Partially matches (one gas in range)
        0.0 = Complete contradiction
        """
        signature = self.GAS_THREAT_SIGNATURES[threat_class]
        so2_min, so2_max = signature["so2_range"]
        no2_min, no2_max = signature["no2_range"]

        # Check if gases are in expected ranges
        so2_in_range = so2_min <= so2_ppb <= so2_max
        no2_in_range = no2_min <= no2_ppb <= no2_max

        # Base score
        if so2_in_range and no2_in_range:
            match = 0.95
        elif so2_in_range or no2_in_range:
            match = 0.60
        else:
            match = 0.20

        # Adjustment: Check for reasonable absolute levels
        if so2_ppb < 5 and no2_ppb < 5:
            # No gas elevation at all - reduce match for high threat classes
            if threat_class in [2, 3]:
                match -= 0.30
            else:
                match += 0.10

        # Adjustment: High SO2 is strong industrial marker
        if threat_class == 3 and so2_ppb > 200:
            match = min(1.0, match + 0.15)

        # Adjustment: High NO2 without SO2 suggests biomass/wildfire
        if threat_class in [1, 2] and no2_ppb > 150 and so2_ppb < 50:
            match = min(1.0, match + 0.20)

        return np.clip(match, 0.0, 1.0)

    def _refine_classification(
        self,
        ml_probability: float,
        gas_match: float,
        threat_class: int,
        so2_ppb: float,
        no2_ppb: float
    ) -> Tuple[float, float, str]:
        """
        Refine ML probability based on gas evidence.
        
        Returns: (refined_probability, confidence_delta, recommendation)
        """
        # Base confidence boost from signature match
        base_boost = self.GAS_THREAT_SIGNATURES[threat_class]["confidence_boost"]

        # Scale boost by how well gases match signature
        scaled_boost = base_boost * gas_match

        # Additional boost if both SO2 and NO2 are elevated
        if so2_ppb > 100 and no2_ppb > 100:
            scaled_boost *= 1.2

        # Refined probability using weighted average
        # More weight to ML if gas data is inconclusive (low gas_match)
        ml_weight = 1.0 - (gas_match * 0.5)  # Gas evidence reduces ML reliance
        refined_prob = (
            ml_probability * ml_weight +
            gas_match * (1 - ml_weight)
        )

        # Add scaled boost
        refined_prob = np.clip(refined_prob + scaled_boost, 0.0, 1.0)
        confidence_delta = refined_prob - ml_probability

        # Generate recommendation
        if gas_match > 0.80 and confidence_delta > 0.15:
            recommendation = f"Classification SOLIDIFIED - Gas signature strongly confirms {self.GAS_THREAT_SIGNATURES[threat_class]['description'].lower()}"
        elif gas_match > 0.60:
            recommendation = f"Classification SUPPORTED - Partial gas evidence for {threat_class}"
        elif gas_match > 0.40:
            recommendation = f"Classification INCONCLUSIVE - Weak gas signature match"
        else:
            recommendation = f"⚠️ CONTRADICTION - Gas signature conflicts with predicted class {threat_class}"

        return refined_prob, confidence_delta, recommendation

    def _determine_agent_status(
        self, gas_match: float, confidence_delta: float, threat_class: int
    ) -> str:
        """Determine high-level agent status."""
        if gas_match > 0.80 and confidence_delta > 0.15:
            return "SOLIDIFIED"
        elif gas_match > 0.40:
            return "SUPPORTED"
        elif gas_match > 0.20:
            return "INCONCLUSIVE"
        else:
            return "CONTRADICTION"

    def _assess_gas_level(
        self, gas_ppb: float, expected_range: Tuple[float, float]
    ) -> str:
        """Assess if gas level is within/above/below expected range."""
        min_val, max_val = expected_range
        if gas_ppb < min_val:
            return "BELOW_EXPECTED"
        elif gas_ppb <= max_val:
            return "WITHIN_RANGE"
        else:
            return "ABOVE_EXPECTED"

    def _generate_flags(
        self,
        so2_ppb: float,
        no2_ppb: float,
        gas_match: float,
        threat_class: int
    ) -> list:
        """Generate warning flags for anomalies."""
        flags = []

        signature = self.GAS_THREAT_SIGNATURES[threat_class]
        so2_min, so2_max = signature["so2_range"]
        no2_min, no2_max = signature["no2_range"]

        if so2_ppb > so2_max * 1.5:
            flags.append(f"⚠️ SO2 significantly elevated ({so2_ppb} ppb)")
        if no2_ppb > no2_max * 1.5:
            flags.append(f"⚠️ NO2 significantly elevated ({no2_ppb} ppb)")

        if gas_match < 0.30:
            flags.append("⚠️ Gas signature strongly contradicts ML prediction - manual review recommended")

        if so2_ppb < 2 and no2_ppb < 2 and threat_class in [2, 3]:
            flags.append("ℹ️ No gas elevation detected for high-threat class")

        return flags

    def _no_gas_data_response(
        self, ml_classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Return response when gas data is unavailable."""
        return {
            "refined_class": ml_classification["threat_class"],
            "refined_probability": ml_classification["probability"],
            "gas_analysis": {
                "so2_ppb": None,
                "no2_ppb": None,
                "so2_status": "NO_DATA",
                "no2_status": "NO_DATA",
                "gas_signature_match": 0.5,  # Neutral
                "data_source": "none",
                "measurement_time": None
            },
            "confidence_delta": 0.0,
            "recommendation": "Gas data unavailable - proceeding with ML classification only",
            "agent2_status": "NO_DATA",
            "flags": ["ℹ️ Gas concentration data could not be retrieved"],
            "threat_class_description": self.GAS_THREAT_SIGNATURES[
                ml_classification["threat_class"]
            ]["description"]
        }


class GasDataFetcher:
    """Fetches SO2/NO2 data from OpenAQ or TROPOMI APIs."""

    def __init__(self, openaq_api_key: Optional[str] = None):
        """
        Initialize gas data fetcher.
        
        Args:
            openaq_api_key: Optional OpenAQ API key (free tier works without it)
        """
        self.openaq_api_key = openaq_api_key
        self.openaq_base_url = "https://api.openaq.org/v2"

    def fetch(
        self, lat: float, lon: float, acq_date: str
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch latest SO2/NO2 data for given coordinates.
        
        Tries OpenAQ first, falls back to placeholder for TROPOMI/satellite data.
        
        Args:
            lat: Latitude
            lon: Longitude
            acq_date: Date in YYYY-MM-DD format
        
        Returns:
            {
                "so2_ppb": float,
                "no2_ppb": float,
                "data_source": str,
                "measurement_time": str,
                "location_name": str
            }
            or None if unable to fetch
        """
        # Try OpenAQ API
        gas_data = self._fetch_from_openaq(lat, lon)
        if gas_data:
            return gas_data

        # TODO: Implement TROPOMI fallback
        # gas_data = self._fetch_from_tropomi(lat, lon, acq_date)

        return None

    def _fetch_from_openaq(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """
        Fetch latest measurements from OpenAQ API.
        
        Uses free tier (no API key required). Returns nearest station measurements
        within 25km radius.
        """
        try:
            import requests
            from datetime import datetime

            # Query OpenAQ for latest measurements
            params = {
                "coordinates": f"{lat},{lon}",
                "radius": 25000,  # 25 km
                "parameter": "so2,no2",
                "limit": 5
            }

            response = requests.get(
                f"{self.openaq_base_url}/latest",
                params=params,
                timeout=5
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("results"):
                logger.debug(f"No OpenAQ measurements found for ({lat}, {lon})")
                return None

            # Extract SO2 and NO2 from results
            result = data["results"][0]
            measurements = result.get("measurements", [])

            so2_ppb = None
            no2_ppb = None
            measurement_time = None

            for meas in measurements:
                if meas["parameter"] == "so2":
                    so2_ppb = meas.get("value", 0)
                    measurement_time = meas.get("lastUpdated", datetime.now().isoformat())
                elif meas["parameter"] == "no2":
                    no2_ppb = meas.get("value", 0)

            # Default to 0 if not found
            so2_ppb = so2_ppb if so2_ppb is not None else 0.0
            no2_ppb = no2_ppb if no2_ppb is not None else 0.0

            return {
                "so2_ppb": so2_ppb,
                "no2_ppb": no2_ppb,
                "data_source": "OpenAQ",
                "measurement_time": measurement_time,
                "location_name": result.get("location", "Unknown")
            }

        except Exception as e:
            logger.warning(f"OpenAQ fetch failed: {e}")
            return None

    def _fetch_from_tropomi(
        self, lat: float, lon: float, acq_date: str
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch SO2/NO2 from Sentinel-5P/TROPOMI via Google Earth Engine.
        
        TODO: Implement when GEE credentials are available.
        Requires: Google Earth Engine registration and authentication.
        """
        logger.info("TROPOMI fallback not yet implemented")
        return None
