# Agent 2: Gas Detector Check Model - Design Document

## 🎯 Overview

**Purpose:** Post-ML classification verification layer that analyzes SO2/NO2 concentrations to refine and solidify threat classification.

**Architecture Position:**
```
┌─────────────────────────────────────────────────────────────┐
│                    ENHANCED PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  FIRMS → Features → ML Classification (4 Classes)           │
│                           ↓                                  │
│                    ┌─────────────────────┐                   │
│                    │   AGENT 2: GAS      │                   │
│                    │   DETECTOR CHECK    │                   │
│                    │ (SO2/NO2 Analysis)  │                   │
│                    └─────────────────────┘                   │
│                           ↓                                  │
│               Refined Classification + Confidence           │
│                           ↓                                  │
│            Anomaly Detection → Risk Score → Alerts          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Sources for SO2/NO2

### **Option 1: Sentinel-5P/TROPOMI** ⭐ Recommended
- **Resolution:** 3-5 km (excellent for urban/industrial areas)
- **Temporal Resolution:** Daily global coverage
- **Data:** SO2, NO2, CO, CH4 concentrations
- **Access:** ESA Copernicus (FREE)
- **API:** Google Earth Engine, Copernicus Data Space Ecosystem, SENTINELHUB

### **Option 2: OpenAQ API** ⭐ Quick Start
- **Coverage:** 10,000+ air quality monitoring stations globally
- **Resolution:** Point-based (ground stations)
- **Real-time:** Updates every 1-6 hours
- **Access:** FREE with registration
- **Best For:** Validation with ground-truth measurements

### **Option 3: CAMS (Copernicus Atmosphere Monitoring Service)**
- **Resolution:** 0.1° (≈10 km)
- **Temporal:** Hourly forecasts & reanalysis
- **Coverage:** Global
- **Access:** FREE via CDS API

---

## 🔧 Implementation Architecture

### **1. Gas Detector Module Structure**

```
backend/app/agents/
├── __init__.py
├── pipeline.py (EXISTING - Detector + Skeptic + Dispatcher)
└── gas_detector/
    ├── __init__.py
    ├── analyzer.py          ← Main SO2/NO2 analyzer
    ├── data_fetcher.py      ← Fetch from TROPOMI/OpenAQ
    ├── threat_mapper.py     ← Map gas signatures to threat classes
    ├── confidence_scorer.py ← Scoring logic
    └── test_gas_detector.py
```

### **2. Threat Class → Gas Signature Mapping**

```python
GAS_THREAT_SIGNATURES = {
    0: {  # Controlled / Low Risk
        "so2_range": (0, 100),          # ppb
        "no2_range": (0, 50),           # ppb
        "confidence_boost": -0.15,      # Reduces confidence if unexpected gas
        "description": "No/low industrial emissions expected"
    },
    
    1: {  # Agricultural / Stubble Burning
        "so2_range": (0, 150),          # Low SO2, variable NO2
        "no2_range": (0, 200),          # High NO2 from combustion
        "confidence_boost": +0.20,      # Confirmed if NO2 detected
        "description": "Biomass burning signature"
    },
    
    2: {  # Wildfire / Vegetation Fuel
        "so2_range": (0, 200),          # Very low SO2
        "no2_range": (50, 300),         # High NO2 from combustion
        "confidence_boost": +0.25,      # Strong if NO2 elevated
        "description": "Pure combustion, no industrial SO2"
    },
    
    3: {  # Critical Industrial Hazard (Refinery/Chemical)
        "so2_range": (100, 2000),       # High SO2 (refinery marker)
        "no2_range": (50, 500),         # Variable NO2
        "confidence_boost": +0.40,      # Strong confirmation if both detected
        "description": "Industrial emission signature"
    }
}
```

### **3. Core Analyzer Logic**

```python
class GasDetectorAnalyzer:
    """
    Verifies ML classification using SO2/NO2 atmospheric concentrations.
    """
    
    def analyze_hotspot(self, hotspot_record, ml_classification):
        """
        Input:
            hotspot_record: Dict with lat, lon, acq_date, confidence_score
            ml_classification: {
                "threat_class": 2,
                "probability": 0.78,
                "predicted_label": "Wildfire / Vegetation Fuel Fire"
            }
        
        Output:
            {
                "refined_class": 2,
                "refined_probability": 0.92,
                "gas_analysis": {
                    "so2_ppb": 45.2,
                    "no2_ppb": 178.5,
                    "so2_status": "BELOW_THRESHOLD",
                    "no2_status": "ELEVATED",
                    "gas_signature_match": 0.85  # [0-1]
                },
                "confidence_delta": +0.14,
                "recommendation": "Classification SOLIDIFIED - high confidence wildfire",
                "flags": []  # Any anomalies
            }
        ```
    
    def fetch_gas_data(self, lat, lon, acq_date):
        """Fetch SO2/NO2 from TROPOMI or OpenAQ"""
        # Try OpenAQ first (fast, ground-truth)
        # Fall back to TROPOMI (satellite, always available)
        pass
    
    def compute_gas_signature_match(self, so2, no2, expected_class):
        """
        Score [0-1] how well observed gases match expected threat class.
        
        Penalize:
        - Too high SO2 for agricultural/wildfire
        - Too low NO2 for industrial
        - No elevation if critical class
        """
        pass
    
    def refine_classification(self, ml_prob, gas_match_score):
        """Blend ML probability with gas signature evidence."""
        # If gas signature matches: increase confidence
        # If contradicts: flag for manual review, reduce confidence
        pass
```

---

## 🔗 Integration with Existing Pipeline

### **Updated IncidentPipeline Flow:**

```python
# In: backend/app/agents/pipeline.py

class IncidentPipeline:
    def __init__(self, anomaly_threshold: float = 70.0):
        self.anomaly_detector = AnomalyDetector()
        self.risk_engine = RiskEngine()
        self.gas_detector = GasDetectorAnalyzer()  # NEW
    
    def process_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        # Step 1: ML Classification
        from backend.app.ml.predictor import FirePredictor
        predictor = FirePredictor()
        ml_pred = predictor.predict_single(record)
        
        # Step 2: Agent 2 - Gas Detector Check ⭐ NEW
        gas_analysis = self.gas_detector.analyze_hotspot(record, ml_pred)
        
        # Update record with refined classification
        record['threat_class'] = gas_analysis['refined_class']
        record['ml_confidence'] = gas_analysis['refined_probability']
        record['gas_so2_ppb'] = gas_analysis['gas_analysis']['so2_ppb']
        record['gas_no2_ppb'] = gas_analysis['gas_analysis']['no2_ppb']
        
        # Step 3: Existing pipeline continues
        risk = self.risk_engine.evaluate(record)
        # ... rest of pipeline
```

---

## 📈 Data Flow Example

```
INPUT:
├─ Lat: 22.57, Lon: 70.21
├─ ML Class: 3 (Industrial Hazard) with 0.68 probability
└─ Acq Date: 2024-09-10

STEP 1: Fetch Gas Data
├─ Query TROPOMI: SO2 = 280 ppb, NO2 = 320 ppb
└─ Query OpenAQ: Check nearby stations (if available)

STEP 2: Evaluate Gas Signature
├─ Expected SO2 range for Class 3: [100, 2000] ✅ Match (280 in range)
├─ Expected NO2 range for Class 3: [50, 500] ✅ Match (320 in range)
└─ Gas Signature Match Score: 0.92

STEP 3: Refine Classification
├─ Original ML Confidence: 0.68
├─ Gas Evidence Boost: +0.18 (signature strong match)
├─ Final Refined Confidence: 0.86
└─ Recommendation: "Classification SOLIDIFIED"

OUTPUT:
{
    "threat_class": 3,
    "probability": 0.86,  # Up from 0.68
    "gas_so2_ppb": 280,
    "gas_no2_ppb": 320,
    "confidence_delta": +0.18,
    "agent2_recommendation": "Industrial hazard classification strongly confirmed by SO2/NO2 signature"
}
```

---

## 🚀 Implementation Phases

### **Phase 1: MVP (2 days)**
- [ ] Create `GasDetectorAnalyzer` class skeleton
- [ ] Integrate OpenAQ API (fastest, easiest data source)
- [ ] Simple SO2/NO2 range matching vs 4 threat classes
- [ ] Return refined probability

### **Phase 2: Enhanced (3-4 days)**
- [ ] Add TROPOMI satellite data fallback
- [ ] Implement confidence scoring algorithm
- [ ] Add temporal analysis (gas concentration trends)
- [ ] Flag contradictions (gas signature conflicts with ML)

### **Phase 3: Production (1 week)**
- [ ] Caching layer (TROPOMI queries are expensive)
- [ ] Error handling (API failures, missing data)
- [ ] Logging & monitoring
- [ ] Integration with alert system

---

## 🔍 Key Metrics for Success

| Metric | Target | Notes |
|--------|--------|-------|
| **Classification Refinement** | +15-25% confidence on correct class | Measure vs ground truth |
| **False Positive Reduction** | -20-30% | Catch misclassifications early |
| **Latency** | <2 seconds per hotspot | Must not block real-time alerts |
| **Data Availability** | 95% coverage | OpenAQ + TROPOMI combined |
| **Cost** | $0 (free APIs) | Both TROPOMI and OpenAQ are free |

---

## 🛠️ API Integration Details

### **OpenAQ API** (Recommended for quick start)
```
GET https://api.openaq.org/v2/latest
?coordinates=22.57,70.21
&radius=25000  # 25km radius
&parameter=so2,no2

Response: {
  "results": [{
    "location": "Station Name",
    "coordinates": {"latitude": 22.57, "longitude": 70.21},
    "measurements": [
      {"parameter": "so2", "value": 45.2, "unit": "ppb", "lastUpdated": "2024-09-10T12:00:00Z"},
      {"parameter": "no2", "value": 120.5, "unit": "ppb", "lastUpdated": "2024-09-10T12:00:00Z"}
    ]
  }]
}
```

### **TROPOMI via Google Earth Engine** (Satellite data)
```python
import ee

collection = ee.ImageCollection('COPERNICUS/S5P/NRTI/NO2')
    .filterDate('2024-09-09', '2024-09-11')
    .filterBounds(ee.Geometry.Point([70.21, 22.57]))

image = collection.first()
no2_band = image.select('NO2_column_number_density')
sample = no2_band.sample(ee.Geometry.Point([70.21, 22.57]), 5000).first()
```

---

## ✅ Next Steps

1. **Review & Approve** this design
2. **Decide on data source:** OpenAQ (fast) vs TROPOMI (comprehensive) or both?
3. **Create gas_detector/ module** with analyzer.py
4. **Implement threat signature mapping** 
5. **Test with sample hotspot data**
6. **Integrate into IncidentPipeline**
7. **Measure confidence boost** on existing test dataset

---

## 📝 Questions to Consider

1. **Which data source to prioritize?** OpenAQ (fast, ground-truth) or TROPOMI (satellite, always available)?
2. **Should we cache gas data** to avoid repeated API calls for same coordinates?
3. **How to handle missing gas data?** Proceed with ML confidence only, or flag as "incomplete"?
4. **Refinement strategy:** Additive (confidence += boost) or multiplicative (confidence *= factor)?
5. **Should we add temporal trending** (is SO2 increasing over past 3 days)?
