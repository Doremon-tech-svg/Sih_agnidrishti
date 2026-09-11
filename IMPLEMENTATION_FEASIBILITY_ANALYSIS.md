# AgniDrishti: 3-Layer Enhancement Feasibility Analysis

**Status:** ✅ ALL 3 APPROACHES ARE IMPLEMENTABLE  
**Difficulty Level:** Medium to Hard  
**Development Time Estimate:** 3-4 weeks (with parallel development)  
**Data Label Requirement:** ❌ ZERO (completely unsupervised/self-supervised)

---

## 🎯 Quick Summary

| Approach | Current State | Implementation Path | Labels Needed | Data Availability |
|----------|---------------|-------------------- |---------------|-------------------|
| **1. Sentinel-2 + CLIP Vision** | ✅ APIs exist | Call Copernicus/USGS APIs, download tiles, process with pretrained CLIP | **0** | Free & Public |
| **2. Autoencoder Anomaly** | ✅ Partial (z-score exists) | Replace z-score with neural autoencoder on historical FRP series | **0** | Already stored in DB |
| **3. FRP Forecasting (LSTM)** | ✅ Time-series ready | Query historical FRP → LSTM/Prophet model → predict next 6-24h | **0** | Already stored in DB |

---

## 📊 Current Project State (Relevant to Implementation)

### ✅ Already Exists in Backend
```
✓ PostgreSQL database with full hotspot history (schema.sql shows: created_at, raw JSONB)
✓ AnomalyDetector class (backend/app/anomaly/detector.py) — uses historical FRP
✓ Historical facility behavior baseline computation (z-score based)
✓ 33-feature engineering pipeline (features/engineer.py)
✓ Risk scoring engine that accepts multiple signals (backend/app/risk/engine.py)
✓ Multi-agent pipeline structure: Detector → Skeptic → Dispatcher
✓ Express.js backend ready to add new endpoints
✓ Model inference framework (backend/app/ml/predictor.py)
```

### 📦 Dependencies Already in requirements.txt
```
numpy>=1.26,<3          ✓ For numerical operations
pandas>=2.1,<3          ✓ For time-series data manipulation
scikit-learn>=1.3,<2    ✓ For preprocessing (StandardScaler, etc.)
joblib>=1.3,<2          ✓ For model serialization (already used)
pytest>=8,<9            ✓ For testing
```

### ⚠️ NEW Dependencies Needed (Small Additions)
```
# Approach 1: Satellite imagery
pip install rasterio>=1.3        # TIFF/GeoTIFF reading
pip install requests>=2.28       # HTTP API calls to Copernicus/USGS
pip install PIL                  # Image preprocessing

# Approach 2 & 3: Deep Learning  
pip install tensorflow>=2.13     # or torch>=2.0 (your choice)
pip install prophet>=1.1.5       # For time-series forecasting (Alternative to LSTM)

# Optional: Visualization & diagnostics
pip install matplotlib>=3.7      # For debugging/validation plots
```

**Total new package weight:** ~800-1000 MB (manageable)

---

## 🔍 Detailed Implementation Plans

## 1️⃣ SENTINEL-2 + CLIP VISION (Image-Based Threat Recognition)

### What It Does
- For each hotspot, downloads a **512×512m satellite image tile** from Sentinel-2 (free ESA satellite)
- Uses pretrained **CLIP** model (OpenAI) to match the image against threat descriptions
- Returns confidence scores for: *"wildfire," "refinery flare," "crop burning," "industrial accident"*
- **No training, no labels** — uses foundation model knowledge

### Step-by-Step Implementation

#### Step 1: Create Sentinel-2 Downloader Module
**File:** `backend/app/ingestion/sentinel/downloader.py`

```python
import requests
import numpy as np
from datetime import datetime, timedelta
from PIL import Image
import rasterio
from rasterio.plot import show

class Sentinel2Downloader:
    """Download Sentinel-2 imagery around hotspot coordinates."""
    
    COPERNICUS_API = "https://scihub.copernicus.eu/dhus"  # Free ESA API
    # Alternative: USGS API (usgs.gov/apps/EarthExplorer) - also free
    
    def __init__(self, user="", password=""):
        """Register free account at scihub.copernicus.eu"""
        self.user = user
        self.password = password
    
    def download_tile(self, lat, lon, date, tile_size_m=512):
        """
        Download Sentinel-2 RGB tile centered on (lat, lon) from closest date.
        Returns numpy array (512, 512, 3) with uint8 values [0-255].
        """
        # Query Copernicus API for products near this date
        products = self.query_copernicus(lat, lon, date)
        
        # Download the most recent/cloudfree product
        best_product = self._select_best_product(products, date)
        
        # Extract RGB bands (B04=Red, B03=Green, B02=Blue)
        rgb_array = self._extract_rgb_bands(best_product, lat, lon, tile_size_m)
        
        return rgb_array
    
    def query_copernicus(self, lat, lon, date):
        """Query Copernicus SciHub for Sentinel-2 products."""
        # Construct bounding box around (lat, lon)
        # Request products from [date-5 days, date] to handle revisit schedule
        # Free tier: ~5-10 day revisit globally
        pass
    
    def _select_best_product(self, products, target_date):
        """Prefer: recent date, low cloud cover, complete product."""
        pass
    
    def _extract_rgb_bands(self, product, lat, lon, tile_size_m):
        """Download specific bands, stack into RGB, return as numpy array."""
        pass
```

#### Step 2: Create CLIP Vision Analyzer Module
**File:** `backend/app/ml/clip_analyzer.py`

```python
from PIL import Image
import numpy as np
import torch
from transformers import CLIPProcessor, CLIPModel

class CLIPThreatAnalyzer:
    """Use pretrained CLIP model to classify hotspot images."""
    
    THREAT_DESCRIPTIONS = {
        "wildfire": "Dense forest fire with orange flames and smoke",
        "agricultural_burning": "Agricultural field with crop stubble burning, smoke",
        "refinery_flare": "Oil/gas refinery with bright flame flare from stack",
        "industrial_accident": "Industrial facility with major fire, thick black smoke",
        "controlled_burn": "Controlled low-intensity burn with moderate smoke",
        "false_positive": "No fire, possibly sensor artifact or sunglint"
    }
    
    def __init__(self):
        """Load pretrained CLIP model (downloads ~1.5GB once, cached locally)."""
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(self.device)
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    
    def analyze_hotspot_image(self, rgb_image_array, lat, lon):
        """
        Args:
            rgb_image_array: numpy array (512, 512, 3) with uint8 values
            lat, lon: context for interpretation
        
        Returns:
            {
                "primary_threat": "wildfire",
                "confidence": 0.87,
                "scores": {
                    "wildfire": 0.87,
                    "agricultural_burning": 0.05,
                    ...
                },
                "explanation": "High-intensity fire with characteristic smoke plume"
            }
        """
        # Convert numpy array to PIL Image
        image = Image.fromarray(rgb_image_array.astype('uint8'))
        
        # Encode image and text descriptions with CLIP
        inputs = self.processor(
            text=list(self.THREAT_DESCRIPTIONS.values()),
            images=image,
            return_tensors="pt",
            padding=True
        ).to(self.device)
        
        # Get logits and convert to probabilities
        outputs = self.model(**inputs)
        logits_per_image = outputs.logits_per_image  # (1, 6)
        probs = torch.softmax(logits_per_image, dim=1).cpu().detach().numpy()[0]
        
        # Map scores back to threat types
        threat_scores = {
            threat: float(probs[i])
            for i, threat in enumerate(self.THREAT_DESCRIPTIONS.keys())
        }
        
        primary_threat = max(threat_scores, key=threat_scores.get)
        confidence = threat_scores[primary_threat]
        
        return {
            "primary_threat": primary_threat,
            "confidence": confidence,
            "scores": threat_scores,
            "image_based_risk_contribution": self._threat_to_risk_weight(primary_threat, confidence)
        }
    
    def _threat_to_risk_weight(self, threat_type, confidence):
        """Convert threat type to risk score contribution (0-30 points)."""
        risk_mapping = {
            "wildfire": 25,
            "industrial_accident": 30,
            "refinery_flare": 10,
            "agricultural_burning": 5,
            "controlled_burn": 3,
            "false_positive": 0
        }
        base_risk = risk_mapping.get(threat_type, 5)
        return base_risk * confidence  # Scale by confidence
```

#### Step 3: Integrate into Risk Engine
**File:** `backend/app/risk/engine.py` (modify existing)

```python
from backend.app.ml.clip_analyzer import CLIPThreatAnalyzer

class RiskEngine:
    def __init__(self, enable_vision=True):
        self.vision_analyzer = CLIPThreatAnalyzer() if enable_vision else None
    
    def evaluate_hotspot(self, feature_dict, rgb_image=None):
        """
        Args:
            feature_dict: existing 33-feature vector
            rgb_image: optional Sentinel-2 image array
        
        This adds a NEW pillar to risk calculation:
        - Fire Intensity Pillar (existing)
        - Industrial Hazard Pillar (existing)
        - Human Vulnerability Pillar (existing)
        - Fuel & Spread Conditions Pillar (existing)
        - Water Body Mitigation Pillar (existing)
        - [NEW] Vision-Based Threat Confirmation Pillar  ← NEW
        """
        
        # Existing pillars...
        intensity_score, intensity_reasons = self._evaluate_fire_intensity(feature_dict)
        
        # NEW pillar: Vision analysis
        vision_contribution = 0
        vision_reasons = []
        
        if self.vision_analyzer and rgb_image is not None:
            vision_result = self.vision_analyzer.analyze_hotspot_image(
                rgb_image, 
                feature_dict["latitude"], 
                feature_dict["longitude"]
            )
            
            vision_contribution = vision_result["image_based_risk_contribution"]
            vision_reasons = [
                f"Vision-based threat: {vision_result['primary_threat']} "
                f"(confidence: {vision_result['confidence']:.1%})"
            ]
        
        # Sum all pillars
        total_risk = intensity_score + industrial_score + vulnerability_score + \
                     fuel_score + water_score + vision_contribution
        
        risk_score = min(100.0, total_risk)
        
        return {
            "risk_score": risk_score,
            "breakdown": {
                "fire_intensity": intensity_score,
                "industrial_hazard": industrial_score,
                "human_vulnerability": vulnerability_score,
                "fuel_spread": fuel_score,
                "water_mitigation": water_score,
                "vision_confirmation": vision_contribution  # NEW
            },
            "reasons": intensity_reasons + ... + vision_reasons
        }
```

#### Step 4: Express.js Endpoint Integration
**File:** `backend/src/routes/ml.js` (add new endpoint)

```javascript
router.post("/api/ml/analyze-with-vision", authenticateToken, async (req, res) => {
    /**
     * Trigger vision-based threat confirmation for a specific hotspot.
     * 
     * Request:
     * {
     *   "hotspot_id": 12345
     * }
     * 
     * Response:
     * {
     *   "hotspot_id": 12345,
     *   "vision_threat": "wildfire",
     *   "vision_confidence": 0.87,
     *   "revised_risk_score": 78.5,
     *   "image_url": "s3://bucket/hotspot-12345-sentinel2.png",
     *   "explanation": "..."
     * }
     */
    
    const { hotspot_id } = req.body;
    
    // Get hotspot from database
    const hotspot = await db.query(
        "SELECT * FROM hotspots WHERE id = $1",
        [hotspot_id]
    );
    
    if (hotspot.rows.length === 0) {
        return res.status(404).json({ error: "Hotspot not found" });
    }
    
    const h = hotspot.rows[0];
    const { lat, lon, acq_date } = h;
    
    try {
        // Download Sentinel-2 image
        const sentinel2Downloader = new Sentinel2Downloader(
            process.env.COPERNICUS_USER,
            process.env.COPERNICUS_PASS
        );
        const rgbImage = await sentinel2Downloader.download_tile(lat, lon, acq_date);
        
        // Analyze with CLIP vision
        const clipAnalyzer = new CLIPThreatAnalyzer();
        const visionResult = clipAnalyzer.analyze_hotspot_image(rgbImage, lat, lon);
        
        // Recalculate risk score with vision input
        const riskEngine = new RiskEngine(enable_vision=true);
        const { features } = h.raw;
        const riskResult = riskEngine.evaluate_hotspot(features, rgbImage);
        
        // Update database
        await db.query(
            "UPDATE hotspots SET risk_score = $1, raw = jsonb_set(raw, '{vision_result}', $2) WHERE id = $3",
            [riskResult.risk_score, JSON.stringify(visionResult), hotspot_id]
        );
        
        res.json({
            hotspot_id,
            vision_threat: visionResult.primary_threat,
            vision_confidence: visionResult.confidence,
            revised_risk_score: riskResult.risk_score,
            explanation: riskResult.reasons.join("; ")
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

### Why It Works (No Labels Needed)
- **CLIP** is pretrained on **400M image-text pairs** from internet
- It already understands: *"wildfire looks like X, refinery looks like Y"*
- You provide domain-specific text prompts, it finds matches
- **Zero fine-tuning needed** — completely zero-shot

### Data Availability & Cost
| Component | Source | Cost | Delay |
|-----------|--------|------|-------|
| **Sentinel-2 imagery** | ESA (free) | $0 | 5-10 days (revisit cycle) |
| **CLIP model** | OpenAI (open source) | $0 | ~30 sec per image (GPU) |
| **Validation API** | USGS WMS (free) | $0 | Instant |

### Pros & Cons
✅ **Pros:**
- Uses real satellite data (credible for regulators)
- No labeled training data
- Visual confirmation increases operator trust
- Can be run offline after download

❌ **Cons:**
- Sentinel-2 revisit is 5-10 days (may miss fast-moving wildfires)
- Cloud cover can block image (handle with fallback)
- GPU needed for fast inference (~4 sec/image on CPU)

---

## 2️⃣ FACILITY AUTOENCODER ANOMALY (Unsupervised Pattern Learning)

### What It Does
- Takes **last 30 days of FRP readings** from one facility (e.g., a refinery)
- Neural network learns: *"What does normal look like?"*
- When new reading comes: if it doesn't fit the learned pattern → **ANOMALY**
- **No labels needed** — model only sees "normal" operation data

### Why This Beats Z-Score
```
Current z-score approach:
  mean_frp = 50 MW, std_dev = 10 MW
  if new_reading = 90 MW  →  z = (90-50)/10 = 4.0  →  flagged as anomaly

Problem: Assumes Gaussian distribution
  - Doesn't capture complex temporal patterns
  - Doesn't account for "gradual ramp-up is normal, sudden spike is not"

New autoencoder approach:
  - Learns actual temporal dynamics
  - Can distinguish: "FRP went from 50→80→110 (normal ramp)" vs "50→20→150 (anomaly)"
  - Self-attention captures facility-specific patterns
```

### Step-by-Step Implementation

#### Step 1: Create Autoencoder Architecture
**File:** `backend/app/ml/autoencoder_anomaly.py`

```python
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from torch.utils.data import TensorDataset, DataLoader
from sklearn.preprocessing import StandardScaler

class FRPAutoencoder(nn.Module):
    """
    Unsupervised autoencoder for learning normal FRP temporal patterns.
    
    Input: Time series of FRP values (last 30 days)
    Output: Reconstruction of same time series
    Anomaly Score: Reconstruction error (MSE)
    
    Architecture:
        Input(30) → Dense(64) → Dense(32) → Dense(16) [BOTTLENECK]
                 → Dense(32) → Dense(64) → Output(30)
    """
    
    def __init__(self, sequence_length=30, latent_dim=16):
        super().__init__()
        self.sequence_length = sequence_length
        self.latent_dim = latent_dim
        
        # Encoder: 30 → 64 → 32 → 16
        self.encoder = nn.Sequential(
            nn.Linear(sequence_length, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, latent_dim)
        )
        
        # Decoder: 16 → 32 → 64 → 30
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, sequence_length)
        )
    
    def forward(self, x):
        """x: (batch_size, 30) time series"""
        latent = self.encoder(x)  # (batch_size, 16)
        reconstruction = self.decoder(latent)  # (batch_size, 30)
        return reconstruction
    
    def get_anomaly_score(self, x):
        """
        Returns reconstruction error as anomaly score.
        Higher score = more anomalous.
        """
        reconstruction = self.forward(x)
        mse = torch.mean((x - reconstruction) ** 2, dim=1)  # Per-sample MSE
        return mse.detach().cpu().numpy()


class AutoencoderAnomalyDetector:
    """
    Train autoencoder on historical "normal" FRP for each facility,
    then score new readings for anomaly.
    """
    
    def __init__(self, sequence_length=30, latent_dim=16, device="cpu"):
        self.sequence_length = sequence_length
        self.device = device
        self.model = FRPAutoencoder(sequence_length, latent_dim).to(device)
        self.scaler = StandardScaler()
        self.anomaly_threshold = None  # Set during training
    
    def prepare_sequences(self, frp_timeseries):
        """
        Convert 1D time series into sliding windows.
        
        Input:  [50, 55, 52, 60, 58, 65, 70, ...] (90 days)
        Output: [[50, 55, ..., 65],    # days 1-30
                 [55, 52, ..., 70],    # days 2-31
                 ...]                  # sliding window
        """
        sequences = []
        for i in range(len(frp_timeseries) - self.sequence_length + 1):
            sequences.append(frp_timeseries[i:i + self.sequence_length])
        return np.array(sequences)
    
    def train(self, facility_id, historical_frp_series, epochs=50, batch_size=8):
        """
        Train autoencoder on 90 days of historical FRP for one facility.
        
        Args:
            facility_id: str (for model storage)
            historical_frp_series: list/array of FRP values over time
            epochs: number of training iterations
            batch_size: batch size for training
        """
        # Prepare sliding windows
        X = self.prepare_sequences(historical_frp_series)  # (n_windows, 30)
        
        # Normalize
        X_scaled = self.scaler.fit_transform(X)  # (n_windows, 30)
        
        # Create DataLoader
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32).to(self.device)
        dataset = TensorDataset(X_tensor)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
        
        # Train
        optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
        criterion = nn.MSELoss()
        
        for epoch in range(epochs):
            total_loss = 0
            for batch in dataloader:
                x_batch = batch[0].to(self.device)
                
                # Forward
                reconstruction = self.model(x_batch)
                loss = criterion(x_batch, reconstruction)
                
                # Backward
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                
                total_loss += loss.item()
            
            if (epoch + 1) % 10 == 0:
                print(f"Epoch {epoch+1}/{epochs}, Loss: {total_loss/len(dataloader):.6f}")
        
        # Set anomaly threshold: 95th percentile of training reconstruction errors
        with torch.no_grad():
            train_scores = self.model.get_anomaly_score(X_tensor)
        self.anomaly_threshold = np.percentile(train_scores, 95)
        
        # Save model
        torch.save({
            'model_state': self.model.state_dict(),
            'scaler_params': {
                'mean': self.scaler.mean_,
                'scale': self.scaler.scale_
            },
            'anomaly_threshold': self.anomaly_threshold
        }, f"models/autoencoder_facility_{facility_id}.pt")
        
        print(f"✓ Trained autoencoder for facility {facility_id}")
        print(f"  Anomaly threshold: {self.anomaly_threshold:.4f}")
    
    def score_new_reading(self, facility_id, frp_last_30_days):
        """
        Given last 30 days of FRP for a facility, score the latest reading.
        
        Returns:
            {
                "anomaly_score": 0.45,
                "is_anomaly": True,
                "severity": "high",
                "explanation": "Current FRP pattern deviates 89% from normal..."
            }
        """
        # Normalize using facility's learned scaler
        X = np.array(frp_last_30_days).reshape(1, -1)
        X_scaled = self.scaler.transform(X)
        
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32).to(self.device)
        score = self.model.get_anomaly_score(X_tensor)[0]
        
        is_anomaly = score > self.anomaly_threshold
        severity = "critical" if score > self.anomaly_threshold * 2 else \
                   "high" if is_anomaly else "normal"
        
        return {
            "anomaly_score": float(score),
            "is_anomaly": bool(is_anomaly),
            "severity": severity,
            "explanation": (
                f"FRP pattern reconstruction error: {score:.4f} "
                f"(threshold: {self.anomaly_threshold:.4f}). "
                f"{'Pattern significantly differs from facility baseline.' if is_anomaly else 'Pattern matches facility baseline.'}"
            ),
            "confidence": min(1.0, score / self.anomaly_threshold)
        }
```

#### Step 2: Batch Training on All Facilities
**File:** `backend/app/ml/train_facility_autoencoders.py`

```python
import pandas as pd
from backend.app.ml.autoencoder_anomaly import AutoencoderAnomalyDetector

def train_all_facility_autoencoders():
    """
    Called once during setup, or weekly in production.
    
    Steps:
    1. Query all facilities from database
    2. For each facility, get last 90 days of FRP
    3. Train autoencoder (5 min per facility on CPU)
    4. Save models to /models/autoencoder_facility_*.pt
    """
    
    # Get all facilities
    facilities = db.query("SELECT id FROM facilities")
    
    for facility_id in facilities:
        # Get 90 days of FRP history for this facility
        historical_frp = db.query(
            """
            SELECT frp FROM hotspots 
            WHERE facility_id = %s 
            AND acq_date >= NOW() - INTERVAL '90 days'
            ORDER BY acq_date ASC
            """,
            (facility_id,)
        )
        
        if len(historical_frp) < 30:
            print(f"⚠️  Facility {facility_id}: insufficient history (need ≥30, got {len(historical_frp)})")
            continue
        
        frp_values = [row['frp'] for row in historical_frp]
        
        # Train autoencoder
        detector = AutoencoderAnomalyDetector()
        detector.train(facility_id, frp_values, epochs=50)

# Entry point
if __name__ == "__main__":
    train_all_facility_autoencoders()
```

#### Step 3: Integrate into Detector Agent
**File:** `backend/app/anomaly/detector.py` (modify existing)

```python
from backend.app.ml.autoencoder_anomaly import AutoencoderAnomalyDetector

class AnomalyDetector:
    
    def __init__(self, z_threshold=3.0, use_autoencoder=True):
        self.z_threshold = z_threshold
        self.use_autoencoder = use_autoencoder
        self.autoencoder_model = None  # Load on demand
    
    def score(self, current_hotspot, history_df):
        """
        Score a new hotspot against facility history.
        
        Now uses TWO methods:
        1. Z-score (existing, fast)
        2. Autoencoder reconstruction error (new, more accurate)
        
        Takes the MAX of both scores.
        """
        
        facility_id = current_hotspot['facility_id']
        current_frp = current_hotspot['frp']
        
        # Method 1: Z-score (existing)
        z_score_result = self._z_score_method(current_hotspot, history_df)
        
        # Method 2: Autoencoder (new)
        autoencoder_result = None
        if self.use_autoencoder:
            # Get last 30 days of FRP for this facility
            frp_last_30 = history_df[
                (history_df['facility_id'] == facility_id) &
                (history_df['is_valid'] == True)
            ]['frp'].tail(30).values.tolist()
            
            if len(frp_last_30) == 30:
                autoencoder_result = self._autoencoder_method(facility_id, frp_last_30)
        
        # Combine results: take max anomaly score
        final_anomaly_score = z_score_result['anomaly_score']
        final_reasons = z_score_result['reasons']
        
        if autoencoder_result:
            if autoencoder_result['anomaly_score'] > final_anomaly_score:
                final_anomaly_score = autoencoder_result['anomaly_score']
                final_reasons.append(autoencoder_result['explanation'])
        
        return {
            "anomaly_score": final_anomaly_score,
            "is_anomaly": final_anomaly_score > self.z_threshold,
            "reasons": final_reasons
        }
```

### Why It Works (No Labels Needed)
- **Autoencoder learns by reconstruction** (unsupervised)
- Only needs **"normal" data** (which you have from past 90 days)
- High reconstruction error = deviation from normal = anomaly
- Works with ANY facility type (generic neural pattern recognition)

### Training Data & Efficiency
| Facility Type | Data Needed | Training Time | Inference Time |
|---------------|-------------|---------------|-----------------|
| Refinery | 30+ FRP readings | ~3-5 min (GPU), 20 min (CPU) | <1 ms |
| Power plant | 30+ FRP readings | ~3-5 min | <1 ms |
| Any facility | 30+ readings | ~3-5 min | <1 ms |

**Total for 1000 facilities:** ~50 hours (can parallelize to 4 hours with 10 GPUs)

### Pros & Cons
✅ **Pros:**
- Completely unsupervised (learns normal patterns automatically)
- More accurate than z-score for complex temporal dynamics
- Works immediately even with new facility (fallback to z-score)
- Handles non-Gaussian distributions

❌ **Cons:**
- Needs 30+ historical readings (can take weeks for new facilities)
- GPU recommended for inference speed
- Requires retraining if facility changes operation mode

---

## 3️⃣ FRP FORECASTING (LSTM / Prophet Time-Series)

### What It Does
- **LSTM Path:** Takes last 14 days of FRP, predicts next 6-24 hours
- **Prophet Path:** Takes last 30 days, learns trend + seasonality, predicts next week
- **Neither needs labels** — supervised by "actual next value" from time-series itself

### Why This Matters
```
Current system: "Is this hotspot abnormal RIGHT NOW?"
Forecasting system: "Is this hotspot ESCALATING toward critical?"

Example:
  Day 1: FRP = 50 MW (normal)
  Day 2: FRP = 75 MW (normal for this facility)
  Day 3: FRP = 120 MW (might be OK)
  Day 4: Forecast predicts FRP = 200 MW  ← TRIGGER PREEMPTIVE ALERT
  
This gives operators 12-24 hours to respond BEFORE crisis.
```

### Step-by-Step Implementation

#### Option A: LSTM (More Flexible, Needs More Tuning)

**File:** `backend/app/ml/frp_lstm_forecaster.py`

```python
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from torch.utils.data import TensorDataset, DataLoader
from sklearn.preprocessing import MinMaxScaler

class FRPLSTM(nn.Module):
    """
    LSTM-based FRP forecaster: predicts next 6-24 hours of FRP.
    
    Input: Last 14 days of hourly FRP (336 values)
    Output: Next 24 hours of FRP (24 values)
    
    Architecture:
        Input(336,1) → LSTM(128) → LSTM(64) → Dense(24)
    """
    
    def __init__(self, input_seq_len=336, forecast_horizon=24, hidden_dim=128):
        super().__init__()
        self.input_seq_len = input_seq_len
        self.forecast_horizon = forecast_horizon
        self.hidden_dim = hidden_dim
        
        self.lstm1 = nn.LSTM(
            input_size=1,
            hidden_size=hidden_dim,
            batch_first=True,
            dropout=0.2
        )
        self.lstm2 = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=64,
            batch_first=True,
            dropout=0.2
        )
        self.fc = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, forecast_horizon)
        )
    
    def forward(self, x):
        """
        x: (batch_size, 336, 1) - last 14 days of hourly FRP
        output: (batch_size, 24) - next 24 hours forecast
        """
        lstm1_out, _ = self.lstm1(x)  # (batch, 336, 128)
        lstm2_out, (h_n, c_n) = self.lstm2(lstm1_out)  # (batch, 336, 64)
        
        # Use only last hidden state
        final_hidden = h_n[-1]  # (batch, 64)
        forecast = self.fc(final_hidden)  # (batch, 24)
        
        return forecast


class FRPForecaster:
    """Train and use LSTM to forecast facility FRP."""
    
    def __init__(self, device="cpu"):
        self.device = device
        self.model = FRPLSTM().to(device)
        self.scaler = MinMaxScaler(feature_range=(0, 1))
    
    def train_facility_forecast(self, facility_id, historical_frp_hourly, epochs=100):
        """
        Args:
            facility_id: str
            historical_frp_hourly: list of FRP values (hourly, 6+ months)
            epochs: training iterations
        """
        
        # Prepare training data: (input: last 336 hours, target: next 24 hours)
        X, y = [], []
        for i in range(len(historical_frp_hourly) - 360):  # 336 + 24
            X.append(historical_frp_hourly[i:i+336])
            y.append(historical_frp_hourly[i+336:i+360])
        
        X = np.array(X)  # (n_samples, 336)
        y = np.array(y)  # (n_samples, 24)
        
        # Normalize
        X_scaled = self.scaler.fit_transform(X.reshape(-1, 1)).reshape(X.shape)
        y_scaled = self.scaler.transform(y.reshape(-1, 1)).reshape(y.shape)
        
        # Convert to tensors
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)\
            .unsqueeze(-1)\
            .to(self.device)  # (n_samples, 336, 1)
        y_tensor = torch.tensor(y_scaled, dtype=torch.float32).to(self.device)
        
        dataset = TensorDataset(X_tensor, y_tensor)
        dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
        
        # Train
        optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
        criterion = nn.MSELoss()
        
        for epoch in range(epochs):
            for x_batch, y_batch in dataloader:
                pred = self.model(x_batch)
                loss = criterion(pred, y_batch)
                
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
        
        # Save
        torch.save(self.model.state_dict(), f"models/frp_lstm_facility_{facility_id}.pt")
    
    def forecast(self, facility_id, last_336_hours_frp):
        """
        Forecast next 24 hours.
        
        Returns:
            {
                "forecast_24h": [45.2, 48.1, 52.3, ...],
                "max_forecast_frp": 78.5,
                "escalation_risk": "high",
                "explanation": "FRP trending upward; peak predicted in 18 hours"
            }
        """
        X = np.array(last_336_hours_frp).reshape(1, -1)
        X_scaled = self.scaler.transform(X)
        
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)\
            .unsqueeze(-1)\
            .to(self.device)
        
        with torch.no_grad():
            forecast_scaled = self.model(X_tensor).cpu().numpy()[0]
        
        forecast = self.scaler.inverse_transform(
            forecast_scaled.reshape(-1, 1)
        ).flatten()
        
        current_frp = last_336_hours_frp[-1]
        max_forecast = forecast.max()
        escalation_pct = (max_forecast - current_frp) / current_frp * 100
        
        escalation_risk = (
            "critical" if escalation_pct > 50 else
            "high" if escalation_pct > 25 else
            "moderate" if escalation_pct > 10 else
            "low"
        )
        
        return {
            "forecast_24h": forecast.tolist(),
            "max_forecast_frp": float(max_forecast),
            "escalation_risk": escalation_risk,
            "escalation_pct": escalation_pct,
            "explanation": (
                f"Current FRP: {current_frp:.1f} MW → "
                f"Peak predicted: {max_forecast:.1f} MW (+{escalation_pct:.0f}%) "
                f"in {forecast.argmax()} hours"
            )
        }
```

#### Option B: Prophet (Simpler, Requires Less Historical Data)

**File:** `backend/app/ml/frp_prophet_forecaster.py`

```python
from prophet import Prophet
import pandas as pd

class FRPProphetForecaster:
    """
    Facebook's Prophet: simpler alternative to LSTM.
    - Handles seasonality automatically
    - Works with less data (~30 days minimum)
    - Interpretable trend + seasonality components
    """
    
    def train_facility_forecast(self, facility_id, frp_timeseries_df):
        """
        Args:
            facility_id: str
            frp_timeseries_df: DataFrame with columns ['ds' (datetime), 'y' (FRP)]
        """
        
        # Prophet expects lowercase 'ds' and 'y' columns
        df = frp_timeseries_df[['acq_date', 'frp']].copy()
        df.columns = ['ds', 'y']
        
        # Fit model (automatically handles trend + weekly/daily seasonality)
        model = Prophet(
            interval_width=0.95,  # 95% confidence interval
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=True
        )
        model.fit(df)
        
        # Save model
        with open(f"models/frp_prophet_facility_{facility_id}.pkl", "wb") as f:
            pickle.dump(model, f)
    
    def forecast(self, facility_id, periods=24):
        """
        Forecast next 24 hours (or 'periods' hours).
        
        Returns:
            {
                "forecast": [45.2, 48.1, ...],
                "forecast_with_ci": [
                    {"yhat": 45.2, "yhat_lower": 42.1, "yhat_upper": 48.3},
                    ...
                ],
                "trend": "increasing",
                "explanation": "..."
            }
        """
        
        # Load model
        with open(f"models/frp_prophet_facility_{facility_id}.pkl", "rb") as f:
            model = pickle.load(f)
        
        future = model.make_future_dataframe(periods=periods, freq='H')
        forecast = model.predict(future)
        
        recent_forecast = forecast.tail(periods)
        
        trend = (
            "increasing" if recent_forecast['trend'].iloc[-1] > recent_forecast['trend'].iloc[0] else
            "decreasing" if recent_forecast['trend'].iloc[-1] < recent_forecast['trend'].iloc[0] else
            "stable"
        )
        
        return {
            "forecast": recent_forecast['yhat'].tolist(),
            "forecast_with_ci": [
                {
                    "yhat": row['yhat'],
                    "yhat_lower": max(0, row['yhat_lower']),
                    "yhat_upper": row['yhat_upper']
                }
                for _, row in recent_forecast.iterrows()
            ],
            "trend": trend,
            "explanation": f"FRP trend is {trend} over next {periods} hours"
        }
```

#### Step 3: Express.js Endpoint

**File:** `backend/src/routes/ml.js` (add endpoint)

```javascript
router.post("/api/ml/forecast-frp", authenticateToken, async (req, res) => {
    /**
     * Forecast FRP for a facility.
     * 
     * Request:
     * {
     *   "facility_id": 5,
     *   "forecast_horizon_hours": 24
     * }
     * 
     * Response:
     * {
     *   "facility_id": 5,
     *   "forecast_24h": [45.2, 48.1, 52.3, ...],
     *   "max_forecast_frp": 78.5,
     *   "escalation_risk": "high",
     *   "escalation_pct": 28.5,
     *   "explanation": "Current 55.2 MW → Peak predicted 78.5 MW in 18 hours"
     * }
     */
    
    const { facility_id, forecast_horizon_hours = 24 } = req.body;
    
    try {
        // Get last 14 days of hourly FRP for this facility
        const frpHistory = await db.query(
            `
            SELECT acq_date, frp FROM hotspots
            WHERE facility_id = $1
            AND acq_date >= NOW() - INTERVAL '14 days'
            ORDER BY acq_date ASC
            `,
            [facility_id]
        );
        
        if (frpHistory.rows.length < 24) {
            return res.status(400).json({
                error: "Insufficient FRP history (need ≥24 readings)"
            });
        }
        
        const frpValues = frpHistory.rows.map(r => r.frp);
        
        // Load and use LSTM forecaster
        const forecaster = new FRPForecaster();
        forecaster.model.load_state_dict(
            torch.load(`models/frp_lstm_facility_${facility_id}.pt`)
        );
        
        const forecast = forecaster.forecast(facility_id, frpValues);
        
        res.json({
            facility_id,
            ...forecast
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

### Why It Works (No Labels Needed)
- **Time-series is self-supervised**
  - Training label = "actual next value" (automatically available)
  - No human annotation needed
  - Learns from ANY facility's history

- **LSTM version:** More flexible, better for irregular patterns
- **Prophet version:** Simpler, works with less data, more interpretable

### Data Availability & Requirements
| Data Source | Frequency | Amount Needed | Wait Time |
|-------------|-----------|---------------|-----------|
| **FIRMS hotspots (existing DB)** | Per detection | 30-90 days | Already have |
| **Additional data** | None | None | N/A |

### Pros & Cons
✅ **Pros:**
- Completely unsupervised (time-series provides its own labels)
- Gives 6-24h warning for escalation
- Works with existing FIRMS data (no new sources)
- Prophet is super simple to implement

❌ **Cons:**
- Prophet needs ≥30 days history (cold start problem for new facilities)
- LSTM needs ≥6 months for good accuracy
- Doesn't work well for sudden, unprecedented spikes
- Requires hourly data (not all FIRMS data is hourly)

---

## 📋 Summary Comparison Table

| Aspect | Vision + CLIP | Autoencoder | LSTM/Prophet |
|--------|---------------|-------------|-------------|
| **Data Labels Needed** | 0 | 0 | 0 |
| **Training Data Required** | 1 Sentinel-2 image per hotspot | 30+ historical FRP readings | 30-180 days historical FRP |
| **Model Training Time** | None (pretrained) | 3-5 min per facility (CPU/GPU) | 10-20 min per facility (GPU) |
| **Inference Time** | 4 sec/image (CPU), 1 sec (GPU) | <1 ms | <1 ms |
| **What It Detects** | Threat type from image | Unusual FRP patterns | FRP escalation trends |
| **Cold Start (new facility)** | Instant (no training needed) | 30 days historical needed | 30+ days historical needed |
| **Facility-Specific** | No (generic) | Yes (per-facility model) | Yes (per-facility model) |
| **Integration Complexity** | Medium | Medium | Low-Medium |
| **Production Readiness** | ⭐⭐⭐⭐ (mature tech) | ⭐⭐⭐ (newer) | ⭐⭐⭐⭐ (robust libraries) |

---

## 🚀 Recommended Implementation Order

### Phase 1 (Weeks 1-2): Foundation
1. **FRP Forecasting (Prophet)** ← Start here (simplest, fastest ROI)
   - Uses existing data only
   - Can be live in production in 1-2 weeks
   - Gives immediate value to operators
   
2. Update risk engine to include forecast signal

### Phase 2 (Weeks 2-3): Unsupervised Learning
3. **Autoencoder Anomaly Detection** ← Build after forecasting works
   - Replaces z-score with neural pattern learning
   - Batch train on all facilities (parallelize if possible)
   - More accurate than current system

### Phase 3 (Weeks 3-4): Vision Integration
4. **Sentinel-2 + CLIP Vision** ← Most complex, last
   - Requires dealing with satellite API latency
   - Adds credibility but not immediate operational value
   - Deploy as "confidence booster" layer

---

## ✅ Implementation Checklist

### Before Starting
- [ ] Confirm budget for cloud compute (optional, not required)
- [ ] Set up PyTorch or TensorFlow environment
- [ ] Register free Copernicus account (for Sentinel-2 imagery)
- [ ] Backup current production database

### Phase 1: FRP Forecasting
- [ ] Implement `frp_prophet_forecaster.py` (simple + robust)
- [ ] Create endpoint `/api/ml/forecast-frp`
- [ ] Train on existing facility FRP data
- [ ] Integrate forecast signal into risk engine
- [ ] Test with 5 sample facilities
- [ ] Deploy to production

### Phase 2: Autoencoder Anomaly
- [ ] Implement `autoencoder_anomaly.py`
- [ ] Create batch training script
- [ ] Train on all facilities (~10-20 hours)
- [ ] Integrate into `AnomalyDetector` class
- [ ] Compare autoencoder scores vs z-score (side-by-side testing)
- [ ] Gradually switch over (10% → 50% → 100% facilities)

### Phase 3: Vision + CLIP
- [ ] Implement `sentinel/downloader.py`
- [ ] Implement `clip_analyzer.py`
- [ ] Create endpoint `/api/ml/analyze-with-vision`
- [ ] Test on 10 sample hotspots
- [ ] Handle failures gracefully (fallback to other methods)
- [ ] Deploy as "bonus signal" (doesn't break existing flow)

### Monitoring & Validation
- [ ] Track forecast accuracy (RMSE, MAE) weekly
- [ ] Monitor anomaly detection false-positive rate
- [ ] Compare vision classifications with operator ground truth
- [ ] Gather operator feedback on usefulness

---

## 💻 Estimated Resource Requirements

### Compute
- **Development:** Laptop/workstation with 8GB+ RAM
- **Training:** GPU optional (8GB+) for faster iteration, but CPU works
- **Production Inference:** CPU sufficient (~1ms per hotspot)

### Storage
- **Models:** ~50-100 MB per approach
- **Sentinel-2 imagery:** Optional caching (~10-50 MB per hotspot)
- **Historical time-series:** Already in PostgreSQL

### External APIs (Free Tier)
- **Sentinel-2 imagery:** ESA Copernicus (free, no rate limit)
- **CLIP model:** HuggingFace (free, no rate limit)
- **Prophet library:** Fully open-source

---

## 🎓 Why This Approach Is Different

**Traditional approach (supervised learning):**
> "Collect 500 labeled hotspots, train model, deploy"
> ❌ Problem: Where do you get 500 verified labels?

**AgniDrishti's three new approaches:**
> 1. **Vision:** Use foundation models (CLIP) trained on billions of images
> 2. **Anomaly:** Learn "normal" from YOUR facility data (unsupervised)
> 3. **Forecasting:** Time-series predicts its own labels (self-supervised)
> 
> ✅ Result: No external labels needed, only YOUR existing data

---

## 📞 Questions & Answers

**Q: Can we run all three simultaneously?**  
A: Yes! Each provides a different signal:
- Vision: "What does it look like?"
- Anomaly: "Is it behaving normally?"
- Forecast: "Is it escalating?"

Risk engine can weight all three.

**Q: What if a facility has <30 days history?**  
A: Autoencoder & Prophet fallback to z-score / global baseline until enough history.

**Q: GPU requirement?**  
A: Optional. Prophet & simple LSTM run fine on CPU. Vision (CLIP) is 4x faster with GPU but still viable on CPU (4 sec/image).

**Q: How do we know if these work?**  
A: Track metrics weekly:
- Forecast: Compare predicted FRP vs actual (RMSE, MAE)
- Anomaly: Monitor false-positive rate vs z-score
- Vision: Gather operator feedback on classification accuracy

---

## ✨ Success Criteria

By end of 4 weeks:
- [ ] Prophet forecasting live in production, predicting FRP trends 24h ahead
- [ ] Autoencoder trained for 80%+ of facilities, improving anomaly detection
- [ ] Vision analysis available as optional confidence booster for key hotspots
- [ ] Zero external labeled data used (fully self/unsupervised)
- [ ] Operator feedback: "These new signals are useful" (avg rating >3/5)

