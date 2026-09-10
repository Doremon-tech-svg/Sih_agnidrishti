"""
Integration Example: Adding Gas Detector (Agent 2) to Incident Pipeline

This shows how to update the existing pipeline.py to include gas detection
as a verification layer after ML classification.
"""

from typing import Any, Dict
import logging
import pandas as pd

from backend.app.anomaly import AnomalyDetector
from backend.app.risk.engine import RiskEngine
from backend.app.agents.gas_detector import GasDetectorAnalyzer
from backend.app.ml.predictor import FirePredictor

logger = logging.getLogger(__name__)


class IncidentPipelineWithGasDetector:
    """
    Enhanced incident pipeline with Agent 2: Gas Detector Check.
    
    Flow:
    1. ML Classification (4 classes)
    2. Gas Detector Verification (SO2/NO2 analysis) ← NEW
    3. Anomaly Detection
    4. Risk Engine
    5. Decision making (status, dispatch)
    """

    def __init__(self, anomaly_threshold: float = 70.0, enable_gas_check: bool = True):
        """
        Initialize enhanced pipeline.
        
        Args:
            anomaly_threshold: Risk score threshold for "VALIDATED" status
            enable_gas_check: Enable/disable Agent 2 gas detector
        """
        self.anomaly_threshold = anomaly_threshold
        self.anomaly_detector = AnomalyDetector()
        self.risk_engine = RiskEngine()
        
        # NEW: Gas detector agent
        self.enable_gas_check = enable_gas_check
        if enable_gas_check:
            self.gas_detector = GasDetectorAnalyzer()
            self.ml_predictor = FirePredictor()
        else:
            self.gas_detector = None
            self.ml_predictor = None

    def process_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run full pipeline for one hotspot.
        
        Args:
            record: Hotspot feature dictionary with all required fields
        
        Returns:
            Enriched record with classification, gas analysis, risk score, etc.
        """
        # ========== STEP 1: ML Classification ==========
        if self.ml_predictor:
            ml_pred = self.ml_predictor.predict_single(record)
            record['ml_threat_class'] = ml_pred['threat_class']
            record['ml_probability'] = ml_pred['probability']
        else:
            # Fallback if predictor not available
            ml_pred = {
                'threat_class': 0,
                'probability': 0.5,
                'predicted_label': 'Unknown'
            }

        # ========== STEP 2: Agent 2 - Gas Detector Check (NEW) ==========
        gas_analysis = None
        if self.enable_gas_check and self.gas_detector:
            try:
                gas_analysis = self.gas_detector.analyze_hotspot(record, ml_pred)
                
                # Update record with refined classification
                record['threat_class'] = gas_analysis['refined_class']
                record['ml_confidence'] = gas_analysis['refined_probability']
                record['gas_so2_ppb'] = gas_analysis['gas_analysis']['so2_ppb']
                record['gas_no2_ppb'] = gas_analysis['gas_analysis']['no2_ppb']
                record['gas_confidence_delta'] = gas_analysis['confidence_delta']
                record['agent2_status'] = gas_analysis['agent2_status']
                record['agent2_recommendation'] = gas_analysis['recommendation']
                record['gas_data_source'] = gas_analysis['gas_analysis']['data_source']
                
                logger.info(
                    f"Gas detector: Class {ml_pred['threat_class']} → "
                    f"{gas_analysis['refined_class']} "
                    f"(confidence: {gas_analysis['original_ml_probability']:.2f} → "
                    f"{gas_analysis['refined_probability']:.2f})"
                )
            except Exception as e:
                logger.warning(f"Gas detector failed, proceeding with ML only: {e}")
                gas_analysis = None
                record['threat_class'] = ml_pred['threat_class']
                record['ml_confidence'] = ml_pred['probability']
                record['agent2_status'] = 'FAILED'
        else:
            # Gas detector disabled
            record['threat_class'] = ml_pred['threat_class']
            record['ml_confidence'] = ml_pred['probability']
            record['agent2_status'] = 'DISABLED'

        # ========== STEP 3: Risk Engine ==========
        risk = self.risk_engine.evaluate(record)
        record['risk_score'] = risk['risk_score']
        record['risk_level'] = risk['risk_level']
        record['risk_breakdown'] = risk['breakdown']
        record['risk_reasons'] = risk['reasons']

        # ========== STEP 4: Skeptic - Confidence Check ==========
        confidence = float(record.get('confidence_score', 0.0))
        suppressed = confidence < 0.3 and record['risk_score'] < 85.0

        # Decision logic
        is_candidate = record['risk_score'] >= self.anomaly_threshold
        reasons = list(risk['reasons'])

        if suppressed:
            status = "SUPPRESSED"
            reasons.append("Low satellite confidence and no critical risk evidence.")
        elif is_candidate:
            status = "VALIDATED"
        else:
            status = "MONITORED"

        # ========== STEP 5: Dispatcher ==========
        dispatch_required = status == "VALIDATED"

        return {
            # Input data
            'event_id': record.get('event_id'),
            'latitude': record.get('latitude'),
            'longitude': record.get('longitude'),
            'acquisition_date': record.get('acquisition_date'),
            
            # ML Classification
            'ml_threat_class': record.get('ml_threat_class'),
            'ml_probability': record.get('ml_probability'),
            'threat_label': self._get_threat_label(record.get('threat_class')),
            
            # Agent 2 - Gas Detector
            'agent2_status': record.get('agent2_status'),
            'agent2_recommendation': record.get('agent2_recommendation'),
            'gas_so2_ppb': record.get('gas_so2_ppb'),
            'gas_no2_ppb': record.get('gas_no2_ppb'),
            'gas_confidence_delta': record.get('gas_confidence_delta'),
            'gas_data_source': record.get('gas_data_source'),
            
            # Final Classification
            'threat_class': record.get('threat_class'),
            'final_confidence': record.get('ml_confidence'),
            
            # Risk Assessment
            'risk_score': record.get('risk_score'),
            'risk_level': record.get('risk_level'),
            'risk_breakdown': record.get('risk_breakdown'),
            
            # Status & Action
            'status': status,
            'detected': True,
            'confidence': round(confidence, 4),
            'dispatch_required': dispatch_required,
            'reasons': reasons,
        }

    def process_dataframe(self, frame: pd.DataFrame) -> pd.DataFrame:
        """
        Process multiple hotspots.
        
        Args:
            frame: DataFrame with hotspot records
        
        Returns:
            DataFrame with enriched predictions and decisions
        """
        results = [
            self.process_record(row)
            for row in frame.to_dict(orient='records')
        ]
        
        # Create output dataframe
        output = pd.DataFrame(results)
        return output

    @staticmethod
    def _get_threat_label(threat_class: int) -> str:
        """Map threat class to human-readable label."""
        labels = {
            0: "Controlled / Low Risk",
            1: "Agricultural / Stubble Burning",
            2: "Wildfire / Vegetation Fuel",
            3: "Critical Industrial Hazard"
        }
        return labels.get(threat_class, "Unknown")


# ========== EXAMPLE USAGE ==========

def example_single_hotspot():
    """Example: Process a single hotspot with gas detection."""
    print("\n" + "="*80)
    print("EXAMPLE 1: Single Hotspot with Gas Detection")
    print("="*80 + "\n")
    
    # Create pipeline with gas detector enabled
    pipeline = IncidentPipelineWithGasDetector(enable_gas_check=True)
    
    # Example hotspot (industrial refinery area)
    hotspot = {
        'event_id': 'EVENT_2024_001',
        'latitude': 22.57,
        'longitude': 70.21,
        'acquisition_date': '2024-09-10',
        'brightness': 280,
        'confidence_score': 0.85,
        'frp': 82.0,
        'acquisition_hour': 12,
        'acquisition_month': 9,
        'is_night': 0,
        'scan': 1.0,
        'track': 1.0,
        'landcover_code': 10,
        'is_cropland': 0,
        'is_vegetation': 1,
        'is_built_up': 1,
        'is_water': 0,
        'is_bare_land': 0,
        'nearest_road_distance_m': 500,
        'nearest_building_distance_m': 800,
        'nearest_settlement_distance_m': 1500,
        'nearest_industrial_distance_m': 200,
        'nearest_water_distance_m': 5000,
        'building_count_500m': 25,
        'settlement_population_3km': 50000,
        'industrial_count': 3,
        'road_count_5km': 8,
        'cropland_pct_3km': 15,
        'vegetation_pct_3km': 45,
        'nightlight_radiance': 12.5,
    }
    
    result = pipeline.process_record(hotspot)
    
    print(f"Event ID: {result['event_id']}")
    print(f"Location: ({result['latitude']:.2f}, {result['longitude']:.2f})")
    print(f"\nML Classification: Class {result['ml_threat_class']} ({result['threat_label']})")
    print(f"  Probability: {result['ml_probability']:.3f}")
    
    print(f"\n[Agent 2] Gas Detector Analysis:")
    print(f"  Status: {result['agent2_status']}")
    print(f"  SO2: {result['gas_so2_ppb']} ppb | NO2: {result['gas_no2_ppb']} ppb")
    print(f"  Confidence Delta: {result['gas_confidence_delta']:+.3f}")
    print(f"  Data Source: {result['gas_data_source']}")
    print(f"  Recommendation: {result['agent2_recommendation']}")
    
    print(f"\nFinal Classification: Class {result['threat_class']}")
    print(f"  Final Confidence: {result['final_confidence']:.3f}")
    
    print(f"\nRisk Assessment:")
    print(f"  Risk Score: {result['risk_score']:.1f}/100")
    print(f"  Risk Level: {result['risk_level']}")
    print(f"  Status: {result['status']}")
    print(f"  Dispatch Required: {result['dispatch_required']}")
    
    print(f"\nReasons:")
    for reason in result['reasons']:
        print(f"  • {reason}")


def example_batch_processing():
    """Example: Process multiple hotspots efficiently."""
    print("\n" + "="*80)
    print("EXAMPLE 2: Batch Processing Multiple Hotspots")
    print("="*80 + "\n")
    
    pipeline = IncidentPipelineWithGasDetector(enable_gas_check=True)
    
    # Create multiple hotspots
    hotspots = pd.DataFrame([
        {
            'event_id': 'EVENT_2024_001',
            'latitude': 22.57,
            'longitude': 70.21,
            'acquisition_date': '2024-09-10',
            'brightness': 280,
            'confidence_score': 0.85,
            'frp': 82.0,
            'acquisition_hour': 12,
            'acquisition_month': 9,
            'is_night': 0,
            'scan': 1.0,
            'track': 1.0,
            'landcover_code': 10,
            'is_cropland': 0,
            'is_vegetation': 1,
            'is_built_up': 1,
            'is_water': 0,
            'is_bare_land': 0,
            'nearest_road_distance_m': 500,
            'nearest_building_distance_m': 800,
            'nearest_settlement_distance_m': 1500,
            'nearest_industrial_distance_m': 200,
            'nearest_water_distance_m': 5000,
            'building_count_500m': 25,
            'settlement_population_3km': 50000,
            'industrial_count': 3,
            'road_count_5km': 8,
            'cropland_pct_3km': 15,
            'vegetation_pct_3km': 45,
            'nightlight_radiance': 12.5,
        },
        {
            'event_id': 'EVENT_2024_002',
            'latitude': 29.15,
            'longitude': 75.85,
            'acquisition_date': '2024-09-10',
            'brightness': 180,
            'confidence_score': 0.78,
            'frp': 45.0,
            'acquisition_hour': 14,
            'acquisition_month': 9,
            'is_night': 0,
            'scan': 1.0,
            'track': 1.0,
            'landcover_code': 20,
            'is_cropland': 1,
            'is_vegetation': 0,
            'is_built_up': 0,
            'is_water': 0,
            'is_bare_land': 0,
            'nearest_road_distance_m': 2000,
            'nearest_building_distance_m': 5000,
            'nearest_settlement_distance_m': 3000,
            'nearest_industrial_distance_m': 15000,
            'nearest_water_distance_m': 8000,
            'building_count_500m': 2,
            'settlement_population_3km': 5000,
            'industrial_count': 0,
            'road_count_5km': 2,
            'cropland_pct_3km': 80,
            'vegetation_pct_3km': 10,
            'nightlight_radiance': 2.1,
        }
    ])
    
    results = pipeline.process_dataframe(hotspots)
    
    print(results[[
        'event_id',
        'ml_threat_class',
        'agent2_status',
        'threat_class',
        'risk_score',
        'status'
    ]].to_string(index=False))
    
    print(f"\n✅ Processed {len(results)} hotspots")
    print(f"  VALIDATED: {(results['status'] == 'VALIDATED').sum()}")
    print(f"  MONITORED: {(results['status'] == 'MONITORED').sum()}")
    print(f"  SUPPRESSED: {(results['status'] == 'SUPPRESSED').sum()}")


if __name__ == "__main__":
    # Note: These examples require:
    # 1. Trained ML model available
    # 2. OpenAQ API access (free)
    # 3. All feature columns in input data
    
    try:
        example_single_hotspot()
        # example_batch_processing()
    except Exception as e:
        print(f"\n⚠️ Example failed: {e}")
        print("\nMake sure:")
        print("  ✓ ML model is trained (backend/app/ml/models/fire_model.pkl)")
        print("  ✓ All required feature columns are present")
        print("  ✓ Internet connection available for OpenAQ API")
