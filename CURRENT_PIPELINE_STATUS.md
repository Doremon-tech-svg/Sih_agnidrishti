# AgniDrishti: Current Pipeline Status ✅

## Your Complete Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AGNIDRISHTI CURRENT PIPELINE                   │
└─────────────────────────────────────────────────────────────────────┘

1. DATA INGESTION
   └─ NASA FIRMS → Parse, validate, normalize
   
2. GEOSPATIAL ENRICHMENT  
   └─ WorldCover + OpenStreetMap (roads, buildings, facilities, POI)
   
3. FEATURE ENGINEERING
   └─ 33-feature numerical vector (thermal, temporal, landcover, spatial, density)
   
4. ML CLASSIFICATION ✅ YOU ARE HERE
   ├─ LightGBM + Random Forest ensemble
   └─ 4-CLASS THREAT PREDICTION:
      ├─ Class 0: Controlled / Low Risk Thermal Activity
      ├─ Class 1: Agricultural / Stubble Burning (Cropland)
      ├─ Class 2: Wildfire / Vegetation Fuel Fire
      └─ Class 3: Critical Industrial Hazard Fire (Refineries/Chemical)
   
5. ANOMALY DETECTION
   └─ Facility-level FRP z-score analysis vs historical behavior
   
6. MULTI-AGENT VERIFICATION
   ├─ Detector: High recall, removes very weak observations
   ├─ Skeptic: False-positive suppression checks
   └─ Dispatcher: Priority assignment
   
7. EXPLAINABLE RISK ENGINE
   └─ Rule-based 0-100 risk score with 5 pillars:
      ├─ Fire intensity & satellite confidence
      ├─ Industrial hazard proximity
      ├─ Human vulnerability (buildings, settlements)
      ├─ Fuel & spread conditions (vegetation, cropland, roads)
      └─ Water body mitigation

8. DATABASE & APIS
   └─ PostgreSQL/PostGIS hotspots, incidents, alerts
   └─ Protected Express APIs + JWT auth

9. FRONTEND DASHBOARD
   └─ Interactive map, facility panel, alerts, ML panel, 3D view

═══════════════════════════════════════════════════════════════════════════

                    [YOU ARE AT STEP 4-7]
         Everything up to Risk Score (0-100) is COMPLETE ✅

═══════════════════════════════════════════════════════════════════════════
```

---

## ✅ What's Already Implemented

### **1. ML Classification - 4 Classes**

```python
THREAT_CLASSES = {
    0: "Controlled / Low Risk Thermal Activity",
    1: "Agricultural / Stubble Burning (Cropland)",
    2: "Wildfire / Vegetation Fuel Fire",
    3: "Critical Industrial Hazard Fire (Refineries / Chemical Zones)"
}
```

**File:** `backend/app/ml/dataset.py` (line 21-25)  
**Status:** ✅ **Fully implemented**

---

### **2. Feature Engineering - 33 Features**

```python
FEATURE_COLUMNS = [
    # Location & Identification (2)
    "latitude", "longitude",
    
    # Temporal (3)
    "acquisition_hour", "acquisition_month", "is_night",
    
    # FIRMS Fire Intensity & Reliability (5)
    "frp", "brightness", "confidence_score", "scan", "track",
    
    # LandCover Context (6)
    "landcover_code", "is_cropland", "is_vegetation", 
    "is_built_up", "is_water", "is_bare_land",
    
    # Distances to Geographic Features (8)
    "nearest_road_distance_m", "nearest_building_distance_m",
    "nearest_settlement_distance_m", "nearest_industrial_distance_m",
    "nearest_water_distance_m", ...
    
    # Density/Proximity/Counts (9)
    "building_count", "industrial_count", "settlement_count", ...
    
    # TOTAL: 33 features
]
```

**File:** `backend/app/features/schema.py`  
**Status:** ✅ **Fully implemented**

---

### **3. Model Training (LightGBM + Random Forest)**

```python
class FireModelTrainer:
    """Trains LightGBM and Random Forest on 33-feature vectors."""
    
    def train(self, X_train, y_train, X_val, y_val):
        # LightGBM
        lgb_model = LGBMClassifier(...)
        lgb_model.fit(X_train, y_train)
        
        # Random Forest
        rf_model = RandomForestClassifier(...)
        rf_model.fit(X_train, y_train)
        
        # Select champion on held-out macro F1
        return champion_model  # Usually LightGBM
```

**File:** `backend/app/ml/trainer.py`  
**Status:** ✅ **Fully implemented**  
**Run:** `python -m backend.app.ml.train_pipeline`

---

### **4. Multi-Class Inference**

```python
class FirePredictor:
    """Production inference: Class + Confidence for each hotspot."""
    
    def predict_single(self, hotspot_features):
        return {
            "predicted_class": 2,              # "Wildfire"
            "threat_name": "Wildfire / Vegetation Fuel Fire",
            "confidence": 0.87,
            "class_probabilities": {
                0: 0.05,  # 5% controlled
                1: 0.08,  # 8% agricultural
                2: 0.87,  # 87% wildfire ← selected
                3: 0.00   # 0% industrial
            }
        }
```

**File:** `backend/app/ml/predictor.py`  
**Status:** ✅ **Fully implemented**

---

### **5. Anomaly Detection (Facility-Level)**

```python
class AnomalyDetector:
    """Compare hotspot FRP vs facility historical baseline."""
    
    def score(self, current_hotspot, historical_frp):
        # Z-score = (current_frp - mean) / std
        z_score = (current_frp - historical_mean) / historical_std
        
        return {
            "anomaly_score": z_score,
            "is_anomaly": z_score > threshold,
            "history_count": len(historical_frp)
        }
```

**File:** `backend/app/anomaly/detector.py`  
**Status:** ✅ **Fully implemented**

---

### **6. Multi-Agent Verification**

```
Detector → Skeptic → Dispatcher

├─ Detector: Keeps high recall, flags all reasonable signals
├─ Skeptic: Removes routine industrial activity, stable flares, 
│           low confidence, other false-positive patterns
└─ Dispatcher: Combines class, confidence, FRP, anomaly, 
               proximity into final priority tier
```

**File:** `ml/agents/pipeline.py`, `detector.py`, `skeptic.py`  
**Status:** ✅ **Fully implemented**

---

### **7. Explainable Risk Engine (0-100 Score)**

```python
class RiskEngine:
    """Rule-based risk scoring with 5 pillars."""
    
    def evaluate(self, hotspot_features):
        # Pillar 1: Fire Intensity (FRP, brightness, confidence)
        intensity_score = ...
        
        # Pillar 2: Industrial Hazard Proximity
        industrial_score = ...
        
        # Pillar 3: Human Vulnerability (buildings, settlements)
        vulnerability_score = ...
        
        # Pillar 4: Fuel & Spread Conditions
        fuel_score = ...
        
        # Pillar 5: Water Body Mitigation
        water_score = ...
        
        # Total Risk (0-100)
        risk_score = min(100, intensity + industrial + 
                         vulnerability + fuel + water)
        
        return {
            "risk_score": risk_score,
            "risk_level": "HIGH",
            "breakdown": {...},
            "reasons": [
                "High FRP: 85 MW",
                "Near industrial area: 500m",
                "High settlement proximity",
                ...
            ]
        }
```

**File:** `backend/app/risk/engine.py` & `backend/app/risk/rules.py`  
**Status:** ✅ **Fully implemented**

---

### **8. Database & APIs**

**Database:**
```sql
hotspots → id, lat, lon, frp, acq_date, classification, 
           class_confidence, risk_score, explanation, raw(JSONB)
           
incidents → id, hotspot_id, agent1(JSONB), agent2(JSONB), 
           agent3(JSONB), status, threat_priority
           
alerts → id, incident_id, tier(1-4), message, sent_at
```

**APIs:**
```
POST /api/ml/run              → Trigger pipeline
GET  /api/ml/status           → Check last run
POST /api/ml/predict          → Single hotspot prediction
GET  /api/hotspots            → List hotspots
GET  /api/incidents           → List incidents
GET  /api/alerts              → Alert feed
```

**Status:** ✅ **Fully implemented**

---

## 📊 Full Current Pipeline Summary

| Stage | Component | Status | Notes |
|-------|-----------|--------|-------|
| **1** | FIRMS Ingestion | ✅ | fetchFirms.js + parser |
| **2** | Enrichment | ✅ | WorldCover + OSM |
| **3** | Feature Engineering | ✅ | 33-feature schema |
| **4** | ML Classification | ✅ | **4-class LightGBM** |
| **5** | Anomaly Detection | ✅ | Z-score based |
| **6** | Multi-Agent Verification | ✅ | Detector→Skeptic→Dispatcher |
| **7** | Risk Scoring | ✅ | **0-100 explainable score** |
| **8** | Database & APIs | ✅ | PostgreSQL + Express.js |
| **9** | Frontend Dashboard | ✅ | React + Vite |

---

## 🚀 What Comes NEXT (After Risk Score)

Everything beyond risk scoring is **enhancement territory**:

```
Risk Score (0-100)
        ↓
    [GAP FOR ENHANCEMENTS]
        ↓
    Option 1: Operator Feedback Loop
    Option 2: Temporal Tracking (detect spreading)
    Option 3: Confidence Calibration
    Option 4: Predictive Priority (12-24h forecast)
    Option 5: Consequence Modeling
    Option 6: Cross-Facility Correlation
        ↓
   Alert Routing → Notifications → Dashboard
```

---

## ✅ Answer to Your Question

**Yes, you have complete ML classification into 4 classes ✅**

- Class definitions: ✅ Defined
- Feature engineering: ✅ 33-feature pipeline ready
- Training pipeline: ✅ LightGBM + Random Forest
- Inference: ✅ Single & batch prediction working
- Integration: ✅ Risk engine accepts class + confidence

**Your next step:** Decide which enhancement(s) to add after the risk score.

Recommended for 2-day sprint:
- **FRP Forecasting** (18-20 hours) → Predicts escalation 24h ahead
- **+ Temporal Tracking** (4-5 hours, if time) → Detects spreading fires

Which would you like to implement?
