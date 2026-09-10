"""Unit tests for GasDetectorAnalyzer - Agent 2."""

import pytest
from backend.app.agents.gas_detector import GasDetectorAnalyzer, GasDataFetcher


class MockGasDataFetcher:
    """Mock fetcher for testing."""

    def __init__(self, so2_ppb: float = 0, no2_ppb: float = 0):
        self.so2_ppb = so2_ppb
        self.no2_ppb = no2_ppb

    def fetch(self, lat, lon, acq_date):
        return {
            "so2_ppb": self.so2_ppb,
            "no2_ppb": self.no2_ppb,
            "data_source": "mock",
            "measurement_time": "2024-09-10T12:00:00Z",
            "location_name": "Test Location"
        }


class TestGasDetectorAnalyzer:
    """Test suite for GasDetectorAnalyzer."""

    def setup_method(self):
        """Setup test fixtures."""
        self.analyzer = GasDetectorAnalyzer()

    # ========== Test Case 1: Industrial Hazard with Strong SO2/NO2 Signature ==========
    def test_class3_industrial_with_elevated_gases(self):
        """Class 3 (Industrial) should be solidified with high SO2+NO2."""
        # Mock data: Strong industrial signature
        fetcher = MockGasDataFetcher(so2_ppb=280, no2_ppb=320)
        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)

        hotspot = {
            "latitude": 22.57,
            "longitude": 70.21,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.85,
            "frp": 82.0
        }

        ml_classification = {
            "threat_class": 3,
            "probability": 0.68,
            "predicted_label": "Critical Industrial Hazard Fire"
        }

        result = analyzer.analyze_hotspot(hotspot, ml_classification)

        assert result["agent2_status"] == "SOLIDIFIED"
        assert result["refined_probability"] > result["original_ml_probability"]
        assert result["confidence_delta"] > 0.15
        assert result["gas_analysis"]["so2_ppb"] == 280
        assert result["gas_analysis"]["no2_ppb"] == 320
        assert "SOLIDIFIED" in result["recommendation"]

    # ========== Test Case 2: Wildfire with High NO2, Low SO2 ==========
    def test_class2_wildfire_with_high_no2_low_so2(self):
        """Class 2 (Wildfire) should be solidified with high NO2 and low SO2."""
        # Mock data: Biomass combustion signature (no industrial SO2)
        fetcher = MockGasDataFetcher(so2_ppb=25, no2_ppb=220)
        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)

        hotspot = {
            "latitude": 25.45,
            "longitude": 68.33,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.92,
            "frp": 145.0
        }

        ml_classification = {
            "threat_class": 2,
            "probability": 0.85,
            "predicted_label": "Wildfire / Vegetation Fuel Fire"
        }

        result = analyzer.analyze_hotspot(hotspot, ml_classification)

        assert result["agent2_status"] in ["SOLIDIFIED", "SUPPORTED"]
        assert result["refined_probability"] >= result["original_ml_probability"]
        assert result["gas_analysis"]["so2_ppb"] == 25
        assert result["gas_analysis"]["no2_ppb"] == 220
        assert result["gas_analysis"]["so2_status"] == "BELOW_EXPECTED"
        assert result["gas_analysis"]["no2_status"] == "WITHIN_RANGE"

    # ========== Test Case 3: Contradiction - Class 3 but No SO2 Elevation ==========
    def test_class3_contradiction_no_gas_elevation(self):
        """Class 3 prediction contradicted by absence of SO2/NO2."""
        # Mock data: Very low gases (shouldn't happen for industrial)
        fetcher = MockGasDataFetcher(so2_ppb=8, no2_ppb=12)
        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)

        hotspot = {
            "latitude": 20.50,
            "longitude": 77.20,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.65,
            "frp": 50.0
        }

        ml_classification = {
            "threat_class": 3,
            "probability": 0.72,
            "predicted_label": "Critical Industrial Hazard Fire"
        }

        result = analyzer.analyze_hotspot(hotspot, ml_classification)

        assert result["agent2_status"] == "CONTRADICTION"
        assert result["confidence_delta"] < 0  # Confidence should decrease
        assert "⚠️" in str(result["flags"]) or "CONTRADICTION" in result["recommendation"]

    # ========== Test Case 4: Agricultural Burning Signature ==========
    def test_class1_agricultural_with_biomass_signature(self):
        """Class 1 (Agricultural) should match moderate NO2 with low SO2."""
        fetcher = MockGasDataFetcher(so2_ppb=45, no2_ppb=155)
        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)

        hotspot = {
            "latitude": 29.15,
            "longitude": 75.85,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.78,
            "frp": 35.0
        }

        ml_classification = {
            "threat_class": 1,
            "probability": 0.71,
            "predicted_label": "Agricultural / Stubble Burning (Cropland)"
        }

        result = analyzer.analyze_hotspot(hotspot, ml_classification)

        assert result["agent2_status"] in ["SOLIDIFIED", "SUPPORTED"]
        assert result["refined_probability"] >= result["original_ml_probability"]

    # ========== Test Case 5: Controlled Fire (Class 0) with No Gas ==========
    def test_class0_controlled_with_no_gas_elevation(self):
        """Class 0 (Controlled) should be supported by low gas levels."""
        fetcher = MockGasDataFetcher(so2_ppb=15, no2_ppb=22)
        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)

        hotspot = {
            "latitude": 26.50,
            "longitude": 88.35,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.55,
            "frp": 8.0
        }

        ml_classification = {
            "threat_class": 0,
            "probability": 0.62,
            "predicted_label": "Controlled / Low Risk Thermal Activity"
        }

        result = analyzer.analyze_hotspot(hotspot, ml_classification)

        assert result["agent2_status"] in ["SUPPORTED", "SOLIDIFIED"]
        # Confidence may increase slightly for low-threat with low gases
        assert result["refined_probability"] >= result["original_ml_probability"] * 0.95

    # ========== Test Case 6: Missing Gas Data ==========
    def test_missing_gas_data_fallback(self):
        """Should gracefully handle missing gas data."""
        fetcher = MockGasDataFetcher()
        fetcher.fetch = lambda lat, lon, acq_date: None  # Simulate fetch failure

        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)

        hotspot = {
            "latitude": 22.57,
            "longitude": 70.21,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.85,
            "frp": 82.0
        }

        ml_classification = {
            "threat_class": 3,
            "probability": 0.68,
            "predicted_label": "Critical Industrial Hazard Fire"
        }

        result = analyzer.analyze_hotspot(hotspot, ml_classification)

        assert result["agent2_status"] == "NO_DATA"
        assert result["confidence_delta"] == 0.0  # No boost/penalty
        assert result["refined_probability"] == result["original_ml_probability"]
        assert "unavailable" in result["recommendation"].lower()

    # ========== Test Case 7: Gas Signature Match Scoring ==========
    def test_gas_signature_match_scoring(self):
        """Test signature match scoring logic."""
        analyzer = GasDetectorAnalyzer()

        # Perfect match for Class 3
        score = analyzer._compute_gas_signature_match(
            so2_ppb=280, no2_ppb=320, threat_class=3
        )
        assert score > 0.85, "Should score high for perfect match"

        # Partial match (one gas in range)
        score = analyzer._compute_gas_signature_match(
            so2_ppb=280, no2_ppb=25, threat_class=3
        )
        assert 0.4 < score < 0.8, "Should score medium for partial match"

        # No match (both gases out of range)
        score = analyzer._compute_gas_signature_match(
            so2_ppb=8, no2_ppb=10, threat_class=3
        )
        assert score < 0.35, "Should score low for no match"

    # ========== Test Case 8: Caching ==========
    def test_caching_behavior(self):
        """Test that gas data is cached properly."""
        call_count = 0

        class CountingFetcher(MockGasDataFetcher):
            def fetch(self, lat, lon, acq_date):
                nonlocal call_count
                call_count += 1
                return super().fetch(lat, lon, acq_date)

        fetcher = CountingFetcher(so2_ppb=100, no2_ppb=150)
        analyzer = GasDetectorAnalyzer(data_fetcher=fetcher, enable_caching=True)

        hotspot = {
            "latitude": 22.57,
            "longitude": 70.21,
            "acquisition_date": "2024-09-10",
            "confidence_score": 0.85,
            "frp": 82.0
        }

        ml_classification = {
            "threat_class": 3,
            "probability": 0.68,
            "predicted_label": "Critical Industrial Hazard Fire"
        }

        # First call
        result1 = analyzer.analyze_hotspot(hotspot, ml_classification)
        assert call_count == 1

        # Second call (should use cache)
        result2 = analyzer.analyze_hotspot(hotspot, ml_classification)
        assert call_count == 1, "Should use cached data"

        # Results should be identical
        assert result1["gas_analysis"]["so2_ppb"] == result2["gas_analysis"]["so2_ppb"]


# ========== Integration Test ==========
def test_integration_with_ml_pipeline():
    """Integration test: Full hotspot → ML → Gas Detector flow."""
    from backend.app.ml.predictor import FirePredictor

    # Note: Requires trained model. Adjust path as needed.
    try:
        predictor = FirePredictor()
    except FileNotFoundError:
        pytest.skip("Model not available - skipping integration test")

    # Create test hotspot
    hotspot = {
        "latitude": 22.57,
        "longitude": 70.21,
        "acquisition_date": "2024-09-10",
        "brightness": 280,
        "confidence_score": 0.85,
        "frp": 82.0,
        "acquisition_hour": 12,
        "acquisition_month": 9,
        "is_night": 0,
        "scan": 1.0,
        "track": 1.0,
        "landcover_code": 10,
        "is_cropland": 0,
        "is_vegetation": 1,
        "is_built_up": 0,
        "is_water": 0,
        "is_bare_land": 0,
        "nearest_road_distance_m": 500,
        "nearest_building_distance_m": 1500,
        "nearest_settlement_distance_m": 2000,
        "nearest_industrial_distance_m": 3500,
        "nearest_water_distance_m": 8000,
        "building_count_500m": 5,
        "settlement_population_3km": 15000,
        "industrial_count": 0
    }

    # ML Prediction
    ml_pred = predictor.predict_single(hotspot)

    # Gas Detection
    fetcher = MockGasDataFetcher(so2_ppb=150, no2_ppb=250)
    gas_analyzer = GasDetectorAnalyzer(data_fetcher=fetcher)
    gas_result = gas_analyzer.analyze_hotspot(hotspot, ml_pred)

    # Verify output structure
    assert "refined_class" in gas_result
    assert "refined_probability" in gas_result
    assert "gas_analysis" in gas_result
    assert "agent2_status" in gas_result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
