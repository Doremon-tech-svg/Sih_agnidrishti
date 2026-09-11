# AgniDrishti: 2-DAY SPRINT PLAN (Realistic)

**⏰ Timeline:** 48 hours  
**🎯 Goal:** Get ONE approach live in production  
**✅ Deliverable:** Working API + Risk Engine Integration

---

## 🏃‍♂️ HONEST ASSESSMENT

With only 2 days, you can realistically complete **ONE** approach:

| Approach | 2-Day Feasible? | Effort | Output |
|----------|---|---|---|
| **FRP Forecasting (Prophet)** | ✅ YES | Easy | Live, working API |
| **Autoencoder Anomaly** | ⚠️ PARTIAL | Medium | Setup only, no production |
| **CLIP Vision** | ❌ NO | Hard | Not possible in 48h |

**Recommendation:** Focus 100% on **Prophet Forecasting** (fastest ROI)

---

## 📋 2-DAY SPRINT: FRP FORECASTING

### **DAY 1: Development & Testing (12 hours)**

#### **Morning (Hours 0-3): Setup**
```
08:00 - Install dependencies
   pip install prophet

08:10 - Quick Prophet tutorial
   - Read: https://facebook.github.io/prophet/docs/quick_start.html
   - Time: 10 min

08:20 - Set up test database connection
   - Query last 30 days of FRP data for 5 sample facilities
   - Write quick SQL to verify data availability
   - Time: 20 min

TOTAL: ~45 min
```

#### **Late Morning (Hours 3-6): Core Code**
```
09:00 - Write frp_prophet_forecaster.py (~150 lines)
   
   Key function:
   class FRPProphetForecaster:
       def train(self, facility_id, frp_df):
           # Load data with columns: ['ds', 'y']
           model = Prophet()
           model.fit(frp_df)
           # Save model
       
       def forecast(self, facility_id, periods=24):
           # Load saved model
           future = model.make_future_dataframe(periods=periods, freq='H')
           forecast = model.predict(future)
           return forecast['yhat'].values
   
   - Reuse: Copy template from IMPLEMENTATION_FEASIBILITY_ANALYSIS.md
   - Time: 1.5-2 hours

11:30 - Test with 5 sample facilities
   - Verify forecasts make sense (no NaNs, reasonable values)
   - Print sample output
   - Time: 45 min

TOTAL: ~2.5 hours
```

#### **Afternoon (Hours 6-9): Express Integration**
```
12:15 - Add /api/ml/forecast-frp endpoint
   
   router.post("/api/ml/forecast-frp", async (req, res) => {
       // Get facility_id from request
       // Query last 30 days FRP
       // Call forecaster.forecast()
       // Return {facility_id, forecast, max_frp, escalation_risk}
   });
   
   - Time: 1 hour

13:15 - Test endpoint with curl/Postman
   curl -X POST http://localhost:3000/api/ml/forecast-frp \
     -H "Content-Type: application/json" \
     -d '{"facility_id": 5}'
   
   - Time: 30 min

TOTAL: ~1.5 hours
```

#### **Late Afternoon (Hours 9-12): Risk Engine Integration**
```
14:00 - Modify risk engine to accept forecast signal
   
   # backend/app/risk/engine.py
   
   def evaluate_hotspot(self, features_dict, forecast_dict=None):
       # Existing pillars...
       intensity_score = ...
       industrial_score = ...
       
       # NEW: Forecast pillar
       forecast_contribution = 0
       if forecast_dict and forecast_dict['escalation_risk'] == 'high':
           forecast_contribution = 15  # Points added
       
       total_risk = intensity + industrial + ... + forecast_contribution
       return {
           'risk_score': min(100, total_risk),
           'forecast_signal': forecast_dict
       }
   
   - Time: 1 hour

15:00 - Quick integration test
   - Ensure risk engine doesn't break with/without forecast
   - Test backward compatibility
   - Time: 30 min

TOTAL: ~1.5 hours

---
DAY 1 TOTAL: 10-11 hours ✅
```

---

### **DAY 2: Testing & Deployment (12 hours)**

#### **Morning (Hours 0-4): Unit Tests**
```
08:00 - Write tests for forecaster
   
   tests/test_frp_forecast.py:
       - test_forecast_with_empty_data() → should return error
       - test_forecast_with_sufficient_data() → should return 24 values
       - test_escalation_risk_calculation() → check logic
       - test_cache_loading() → verify model reuse
   
   - Time: 1.5-2 hours

10:00 - Test API endpoint
   
   tests/test_forecast_api.py:
       - test_forecast_endpoint_unauthorized() → 401
       - test_forecast_endpoint_missing_facility() → 404
       - test_forecast_endpoint_success() → 200 + forecast data
   
   - Time: 1 hour

11:00 - Run full test suite
   pytest backend/app -q
   
   - Fix any failures
   - Time: 1 hour

TOTAL: ~3.5 hours
```

#### **Late Morning (Hours 4-6): Documentation**
```
12:00 - Document API endpoint
   
   /api/ml/forecast-frp
   
   Request:
   {
       "facility_id": 5,
       "forecast_horizon_hours": 24
   }
   
   Response:
   {
       "facility_id": 5,
       "forecast_24h": [45.2, 48.1, 52.3, ...],
       "max_forecast_frp": 78.5,
       "escalation_risk": "high",
       "explanation": "..."
   }
   
   - Time: 30 min

12:30 - Add comment to code
   - Document classes and functions
   - Add usage examples
   - Time: 30 min

TOTAL: ~1 hour
```

#### **Afternoon (Hours 6-12): Production Validation**
```
13:00 - Performance test
   
   - Time: How long does forecasting take?
     Expected: Prophet ~5-20 sec per facility (once trained)
   
   - Test on 10 facilities in parallel
   - Measure latency, memory usage
   - Time: 1 hour

14:00 - Verify database writes
   
   - Check that risk scores are updated correctly
   - Verify forecast data stored in hotspots.raw JSONB
   - Confirm no existing data corrupted
   - Time: 1 hour

15:00 - Final integration test
   
   End-to-end:
   1. New hotspot comes in (FIRMS)
   2. Risk engine calculates base risk
   3. Prophet forecast triggered
   4. Risk score updated with forecast signal
   5. Operator sees combined risk
   
   - Time: 1 hour

16:00 - Deploy to staging (if available)
   
   - Push code to staging branch
   - Run on staging database
   - Smoke test
   - Time: 1 hour

TOTAL: ~4 hours

---
DAY 2 TOTAL: 8-9 hours ✅
```

---

## ✅ WHAT YOU GET IN 2 DAYS

### **Fully Working Deliverables:**

1. **`frp_prophet_forecaster.py`** (~150 lines)
   - Trains Prophet on historical FRP
   - Forecasts next 24 hours
   - Cached model reuse

2. **`/api/ml/forecast-frp` Endpoint**
   - Full JWT auth
   - Database integration
   - Error handling

3. **Risk Engine Enhancement**
   - Forecast signal as new pillar
   - Combines with existing 5 pillars
   - Backward compatible

4. **Full Test Coverage**
   - Unit tests (forecaster logic)
   - API tests (endpoint behavior)
   - Integration tests (end-to-end)

5. **Documentation**
   - API contract
   - Code comments
   - Usage examples

---

## 📊 CODE CHECKLIST (Copy-Paste Ready)

### **File 1: `backend/app/ml/frp_prophet_forecaster.py`**

```python
"""FRP forecasting using Facebook's Prophet library."""

from prophet import Prophet
import pandas as pd
import pickle
from pathlib import Path

class FRPProphetForecaster:
    """Simple Prophet-based FRP forecaster."""
    
    def __init__(self, models_dir="backend/app/ml/models"):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(exist_ok=True)
    
    def train(self, facility_id, frp_timeseries_df):
        """
        Train Prophet on historical FRP.
        
        Args:
            facility_id: int
            frp_timeseries_df: DataFrame with ['acq_date', 'frp']
        """
        df = frp_timeseries_df[['acq_date', 'frp']].copy()
        df.columns = ['ds', 'y']
        df = df.sort_values('ds')
        
        model = Prophet(
            interval_width=0.95,
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=True
        )
        model.fit(df)
        
        # Save model
        model_path = self.models_dir / f"frp_prophet_{facility_id}.pkl"
        with open(model_path, 'wb') as f:
            pickle.dump(model, f)
        
        return model
    
    def forecast(self, facility_id, periods=24):
        """
        Forecast next N hours for facility.
        
        Returns:
            {
                "forecast": [45.2, 48.1, ...],
                "max_frp": 78.5,
                "escalation_risk": "high"
            }
        """
        model_path = self.models_dir / f"frp_prophet_{facility_id}.pkl"
        
        if not model_path.exists():
            return {"error": f"No model trained for facility {facility_id}"}
        
        with open(model_path, 'rb') as f:
            model = pickle.load(f)
        
        future = model.make_future_dataframe(periods=periods, freq='H')
        forecast = model.predict(future)
        recent = forecast.tail(periods)
        
        forecast_values = recent['yhat'].tolist()
        max_frp = max(forecast_values)
        
        escalation_risk = (
            "critical" if max_frp > 150 else
            "high" if max_frp > 100 else
            "moderate" if max_frp > 50 else
            "low"
        )
        
        return {
            "forecast": forecast_values,
            "max_frp": max_frp,
            "escalation_risk": escalation_risk
        }
```

### **File 2: `backend/src/routes/ml.js` (Add to existing)**

```javascript
// Add this route to existing ml.js

router.post("/api/ml/forecast-frp", authenticateToken, async (req, res) => {
    const { facility_id, forecast_horizon_hours = 24 } = req.body;
    
    try {
        // Get last 30 days of FRP
        const result = await db.query(
            `SELECT acq_date, frp FROM hotspots
             WHERE facility_id = $1
             AND acq_date >= NOW() - INTERVAL '30 days'
             ORDER BY acq_date ASC`,
            [facility_id]
        );
        
        if (result.rows.length < 5) {
            return res.status(400).json({
                error: "Insufficient FRP history (need ≥5 readings)"
            });
        }
        
        // Load forecaster and predict
        const { FRPProphetForecaster } = await import('../mlBridge.js');
        const forecaster = new FRPProphetForecaster();
        const forecast = forecaster.forecast(facility_id, forecast_horizon_hours);
        
        res.json({
            facility_id,
            ...forecast
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

### **File 3: `backend/app/risk/engine.py` (Modify)**

```python
# In RiskEngine.evaluate() method, add this:

def evaluate(self, hotspot_record, forecast_data=None):
    # ... existing code ...
    
    # NEW: Forecast pillar
    forecast_points = 0
    forecast_reasons = []
    
    if forecast_data and forecast_data.get('escalation_risk') == 'high':
        forecast_points = 15
        forecast_reasons.append(
            f"FRP forecast escalation: max predicted {forecast_data['max_frp']:.0f} MW"
        )
    
    total_risk = intensity_score + industrial_score + ... + forecast_points
    
    return {
        "risk_score": min(100.0, total_risk),
        "forecast_signal": forecast_data
    }
```

---

## 🎯 SUCCESS CRITERIA FOR 2-DAY SPRINT

### **Day 1 Deliverables:**
- [ ] Prophet installed, tested with sample data
- [ ] `frp_prophet_forecaster.py` written and working
- [ ] `/api/ml/forecast-frp` endpoint responding
- [ ] Basic risk engine integration done

### **Day 2 Deliverables:**
- [ ] All unit tests passing
- [ ] API endpoint fully tested (success + error cases)
- [ ] Backward compatibility verified (old code still works)
- [ ] Documentation complete
- [ ] Ready for staging deployment

### **"Done" Definition:**
✅ Operator can call `/api/ml/forecast-frp` and get:
```json
{
  "facility_id": 5,
  "forecast_24h": [45.2, 48.1, 52.3, ...],
  "max_forecast_frp": 78.5,
  "escalation_risk": "high",
  "explanation": "FRP trending upward; peak in 18h"
}
```

---

## ⚠️ WHAT WON'T GET DONE

❌ **In 2 days, you'll skip:**
- Autoencoder anomaly detection (needs 5+ days minimum)
- Sentinel-2 + CLIP vision (needs 8+ days minimum)
- Extensive performance optimization
- Stress testing at scale
- Fancy caching strategies

✅ **But you WILL get:**
- Working forecasting system
- Live in production
- Foundation for later enhancements

---

## 🚀 DEPLOYMENT CHECKLIST (Day 2, 4 PM)

**Before pushing to production:**

- [ ] Code compiles without errors
- [ ] All tests passing (pytest backend/app -q)
- [ ] No breaking changes to existing endpoints
- [ ] Database schema unchanged
- [ ] Prophet model saves/loads correctly
- [ ] API returns correct JSON structure
- [ ] Error handling works (invalid facility ID, no data, etc.)
- [ ] Git commit with clear message

```bash
# Final commands before push
pytest backend/app -q          # All tests pass
python -m pytest --cov         # Check coverage

git add .
git commit -m "Feature: FRP forecasting with Prophet

- New /api/ml/forecast-frp endpoint
- Predicts next 24-48 hours FRP per facility
- Integrates with risk engine
- Zero breaking changes to existing code"

git push origin feature/frp-forecasting
```

---

## 💡 QUICK WINS (If You Finish Early)

**Remaining time on Day 2?**

1. **Add caching** (5 min):
   - Cache models in memory to avoid reload
   - Skip if Prophet loads fast enough (~2 sec)

2. **Add error logging** (15 min):
   - Log each forecast calculation
   - Helps with debugging later

3. **Add visualization endpoint** (30 min):
   - Return forecast as chart data
   - Frontend can plot the curve

4. **Start Autoencoder setup** (1 hour):
   - Write empty class structure
   - Plan training pipeline for next sprint

---

## 📞 IF THINGS GO WRONG

### **Issue: Prophet takes forever to install**
→ Solution: Use `pip install prophet -q` (quiet mode)

### **Issue: Models don't save**
→ Solution: Check `/models/` directory exists, write permissions OK

### **Issue: API endpoint returns 500**
→ Solution: Check database connection, print error logs, verify SQL query

### **Issue: Risk engine breaks existing code**
→ Solution: Make forecast signal optional (if None, skip it)

### **Issue: Tests fail**
→ Solution: Run one test at a time to isolate issue

---

## ⏰ TIME BUFFER

**Realistic 2-day breakdown:**

```
Day 1:
  Setup & dependencies:        45 min
  Core forecaster code:         2 hours
  Testing forecaster:           45 min
  Express integration:          1 hour
  Risk engine integration:      1.5 hours
  Buffer/debugging:             4 hours
  ─────────────────────
  TOTAL:                        ~10 hours

Day 2:
  Unit tests:                   2 hours
  API tests:                    1 hour
  Integration test:             1 hour
  Documentation:               1 hour
  Production validation:        2 hours
  Buffer/fixes:                 5 hours
  ─────────────────────
  TOTAL:                        ~12 hours

GRAND TOTAL: 22 hours (fits in 2 full days!)
```

**If you work 10 AM - 10 PM with lunch breaks, you'll fit comfortably.**

