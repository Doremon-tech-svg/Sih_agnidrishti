# Post-Risk Score Enhancements for AgniDrishti

## Current Pipeline (Risk Score is the End)

```
FIRMS → Enrichment → Features → ML Classification → Anomaly → Multi-Agent → Risk Score (0-100)
                                                                                      ↓
                                                                          [END: Alert/Notify]
```

---

## 🎯 What Could Be Added AFTER Risk Score

### **1. CONFIDENCE CALIBRATION & UNCERTAINTY QUANTIFICATION** ⭐⭐⭐⭐⭐
**Value:** High | **Effort:** Medium | **2-Day Feasible?** ✅ Partially

#### Problem
```
Current system says: "Risk Score: 75/100"
But question is: How confident are we in this 75?

- Is it really 75±5 (very confident)?
- Or 75±25 (uncertain, could be 50-100)?

Operators need to know: "Should I trust this alert or is it a coin flip?"
```

#### Solution
```python
class RiskUncertainty:
    """Add uncertainty bands around risk score."""
    
    def calculate_confidence(self, risk_score, contributing_factors):
        """
        Factors that reduce confidence:
        - Missing geographic context (OSM data unavailable)
        - Conflicting signals (ML says Class 0, Anomaly says anomaly, Vision says wildfire)
        - Low satellite confidence (raw FIRMS confidence < 50%)
        - Inadequate facility history (<30 days)
        - Weather uncertainty (cloud cover in image)
        """
        
        confidence = 1.0
        
        # Deduct confidence for missing data
        if not contributing_factors['has_osm_context']:
            confidence -= 0.15
        if not contributing_factors['has_satellite_history']:
            confidence -= 0.20
        
        # Deduct for conflicting ML signals
        if abs(contributing_factors['ml_probability'] - 0.5) < 0.1:
            confidence -= 0.20  # Uncertain prediction
        
        return {
            "risk_score": risk_score,
            "confidence": max(0.3, confidence),  # Min 30% confidence
            "risk_range_lower": risk_score * (1 - (1 - confidence)),
            "risk_range_upper": risk_score * (1 + (1 - confidence)),
            "interpretation": (
                "Very High" if confidence > 0.85 else
                "High" if confidence > 0.70 else
                "Medium" if confidence > 0.50 else
                "Low"
            )
        }

# Example output:
{
    "risk_score": 75,
    "confidence": 0.82,
    "risk_range_lower": 68,      # ← If data is missing, could be as low as 68
    "risk_range_upper": 82,      # ← Could be as high as 82
    "interpretation": "High confidence in risk estimate"
}
```

#### Why This Helps
✅ Operator sees: "Risk 75 (confident)" vs "Risk 75 (uncertain, could be 50-100)"  
✅ System routes high-confidence alerts to senior operators, low-confidence to QA  
✅ Helps distinguish "definitely dangerous" from "maybe dangerous"

---

### **2. TEMPORAL TRACKING (Same Hotspot Over Time)** ⭐⭐⭐⭐⭐
**Value:** Very High | **Effort:** Medium | **2-Day Feasible?** ✅ Yes (partially)

#### Problem
```
Current system: Treats each hotspot independently
"Hotspot detected at coordinates (X, Y) on Sept 9"

But reality:
"Same fire has been burning at (X, Y) for 3 days, 
 now spreading NE to (X+0.01, Y+0.01) — this is ESCALATION"

Current system sees 100 new hotspots and treats each as independent.
Reality: 1 spreading fire with 100 observations.
```

#### Solution
```python
class TemporalHotspotTracker:
    """Track same fire over multiple FIRMS passes."""
    
    def cluster_hotspots_spatial_temporal(self, hotspots_df):
        """
        Instead of alerting on each hotspot:
        1. Cluster hotspots by proximity (1 km radius)
        2. Track clusters over time (12-24 hours)
        3. Detect spread patterns
        """
        
        # Group hotspots within 1 km, same 24-hour window
        clusters = self._dbscan_spatial_temporal(
            hotspots_df,
            eps_km=1.0,
            time_window_hours=24
        )
        
        tracked_fires = []
        for cluster_id, cluster_hotspots in clusters.items():
            fire = {
                "cluster_id": cluster_id,
                "center_lat": cluster_hotspots['lat'].mean(),
                "center_lon": cluster_hotspots['lon'].mean(),
                "num_observations": len(cluster_hotspots),
                "first_detection": cluster_hotspots['acq_date'].min(),
                "last_detection": cluster_hotspots['acq_date'].max(),
                "duration_hours": (cluster_hotspots['acq_date'].max() - 
                                  cluster_hotspots['acq_date'].min()).total_seconds() / 3600,
                "avg_frp": cluster_hotspots['frp'].mean(),
                "max_frp": cluster_hotspots['frp'].max(),
                "spread_status": self._detect_spread(cluster_hotspots)
            }
            tracked_fires.append(fire)
        
        return tracked_fires
    
    def _detect_spread(self, cluster_hotspots):
        """Detect if fire is spreading, shrinking, or stable."""
        if len(cluster_hotspots) < 2:
            return "single_observation"
        
        # Sort by time
        sorted_hs = cluster_hotspots.sort_values('acq_date')
        
        # Calculate spatial extent over time
        early_area = self._convex_hull_area(sorted_hs.iloc[:len(sorted_hs)//2])
        late_area = self._convex_hull_area(sorted_hs.iloc[len(sorted_hs)//2:])
        
        if late_area > early_area * 1.5:
            return "SPREADING"  # ← Alert operator immediately
        elif late_area < early_area * 0.8:
            return "SHRINKING"
        else:
            return "STABLE"

# Example: Track same fire
{
    "cluster_id": 123,
    "center": (22.57, 70.21),
    "observations": 15,  # 15 FIRMS detections over 24 hours
    "first_seen": "2026-09-08 18:00",
    "last_seen": "2026-09-09 12:00",
    "duration": 18,  # hours
    "avg_frp": 65.2,
    "max_frp": 142.5,
    "spread_status": "SPREADING" ← CRITICAL SIGNAL
}
```

#### Why This Helps
✅ 15 hotspots from same fire = 1 alert (not 15 alerts)  
✅ Detect spreading/escalation in real-time  
✅ Better event attribution (which alerts are same incident vs new incidents?)

---

### **3. OPERATOR FEEDBACK LOOP (Ground Truth Validation)** ⭐⭐⭐⭐⭐
**Value:** Very High | **Effort:** Low-Medium | **2-Day Feasible?** ✅ Yes

#### Problem
```
System generates alerts, but operators know if they're correct.

Currently: System has NO WAY to learn from operator feedback.

Question: Was the alert correct?
- "Yes, confirmed fire" → Use for positive feedback
- "False alarm, no fire" → Use for negative feedback
- "Unclear" → Mark as uncertain

This feedback never reaches the model.
```

#### Solution
```python
# Add new table to PostgreSQL
"""
CREATE TABLE alert_feedback (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id),
  hotspot_id INTEGER REFERENCES hotspots(id),
  operator_id INTEGER REFERENCES users(id),
  feedback TEXT,  -- 'confirmed', 'false_alarm', 'uncertain'
  confidence_in_feedback FLOAT,  -- 0-1
  comments TEXT,
  feedback_date TIMESTAMPTZ DEFAULT now()
);
"""

# New Express endpoint
router.post("/api/ml/feedback-alert", authenticateToken, (req, res) => {
    const { alert_id, hotspot_id, feedback, comments } = req.body;
    
    // feedback: 'confirmed' | 'false_alarm' | 'uncertain'
    
    // Store feedback
    db.query(`INSERT INTO alert_feedback (alert_id, hotspot_id, operator_id, feedback, comments)
              VALUES ($1, $2, $3, $4, $5)`,
              [alert_id, hotspot_id, req.user.id, feedback, comments]);
    
    // Calculate feedback metrics
    const metrics = calculateSystemAccuracy(feedback);
    
    res.json({ success: true, metrics });
});

class FeedbackAnalyzer:
    """Analyze operator feedback to improve model."""
    
    def calculate_false_positive_rate(self, time_window_days=7):
        """
        Out of last 7 days of alerts:
        - How many did operators say were false alarms?
        """
        feedback = db.query(
            "SELECT feedback, COUNT(*) as count FROM alert_feedback "
            "WHERE feedback_date >= NOW() - INTERVAL '7 days' "
            "GROUP BY feedback"
        )
        
        false_alarms = sum(row.count for row in feedback if row.feedback == 'false_alarm')
        total = sum(row.count for row in feedback)
        
        false_positive_rate = false_alarms / total if total > 0 else 0
        
        return {
            "false_positive_rate": false_positive_rate,
            "threshold_recommendation": (
                "Lower alert threshold (too conservative)" if false_positive_rate < 0.05 else
                "Current thresholds good" if false_positive_rate < 0.15 else
                "Raise alert threshold (too many false alarms)" if false_positive_rate > 0.30 else
                "Acceptable"
            )
        }
    
    def retrain_risk_engine_weights(self):
        """
        Use feedback to adjust risk engine weights.
        
        Example:
        - Fire near buildings: Operators confirmed 90% accuracy
        - Fire in cropland: Operators confirmed only 40% accuracy
        
        → Lower risk weight for cropland, increase for buildings
        """
        
        feedback_by_landcover = db.query(
            """SELECT landcover_code, feedback, COUNT(*) as count
               FROM alert_feedback af
               JOIN hotspots h ON af.hotspot_id = h.id
               WHERE af.feedback = 'confirmed'
               GROUP BY landcover_code, feedback"""
        )
        
        # Recalculate risk weights based on accuracy per landcover
        pass
```

#### Why This Helps
✅ Measure: "Are our alerts actually correct?" (FP rate)  
✅ Continuous improvement: Adjust risk thresholds based on real outcomes  
✅ System learns: "Buildings near fires = actual fire (validate more)" vs "Cropland = often false (suppress more)"

---

### **4. PREDICTIVE PRIORITY (Not Just Current, But Next 24 Hours)** ⭐⭐⭐⭐
**Value:** High | **Effort:** Medium | **2-Day Feasible?** ✅ Partially (Day 1 extension)

#### Problem
```
Current: "What is the risk RIGHT NOW?"

Better: "What WILL BE dangerous in the next 6-24 hours?"

Example:
- Current risk: 45 (moderate)
- FRP trend: Increasing by 10 MW/hour
- 24-hour forecast: Will reach 85 (critical)
- → Send preemptive alert 18 hours early
```

#### Solution
```python
class PredictiveRiskAdjustment:
    """Adjust risk based on predicted trajectory, not just current state."""
    
    def adjust_risk_with_forecast(self, current_risk_score, frp_forecast, anomaly_trend):
        """
        current_risk_score: 45 (current)
        frp_forecast: [45, 50, 55, 60, 70, 85, 95, ...] (next 24 hours)
        anomaly_trend: "escalating" | "stable" | "deescalating"
        
        Prediction: Will this become critical?
        """
        
        max_forecast_frp = max(frp_forecast)
        current_frp = frp_forecast[0]
        escalation_percent = (max_forecast_frp - current_frp) / current_frp * 100
        
        # Adjust risk upward if trending toward critical
        predictive_adjustment = 0
        
        if escalation_percent > 50:
            predictive_adjustment = 20  # Boost risk score
        elif escalation_percent > 25:
            predictive_adjustment = 10
        
        if anomaly_trend == "escalating":
            predictive_adjustment += 10
        
        adjusted_risk = min(100, current_risk_score + predictive_adjustment)
        
        # Determine action
        action = (
            "IMMEDIATE_ALERT" if adjusted_risk > 80 else
            "ELEVATED_WATCHLIST" if adjusted_risk > 60 else
            "MONITOR"
        )
        
        return {
            "current_risk": current_risk_score,
            "adjusted_risk": adjusted_risk,
            "adjustment_reason": f"Predicted to escalate {escalation_percent:.0f}% in 24h",
            "recommended_action": action
        }
```

#### Why This Helps
✅ Operators get 12-24 hour warning before crisis  
✅ Proactive response (evacuate, deploy resources) vs reactive  
✅ Risk prioritization: "This will be bad" vs "This is bad now"

---

### **5. CONSEQUENCE & IMPACT MODELING** ⭐⭐⭐⭐
**Value:** High | **Effort:** Medium-High | **2-Day Feasible?** ❌ No (Week 2+)

#### Problem
```
Risk scores are abstract: "Risk 85/100" 

But operators need: "85/100 near a hospital with 500 patients upwind"

Same risk score has different consequences:
- Fire in empty desert: Risk 85 = evacuate buildings, minimal impact
- Fire near hospital: Risk 45 = evacuate 500+ people, potential mass casualties
```

#### Solution
```python
class ConsequenceModeler:
    """Estimate real-world impact of fire."""
    
    def calculate_consequence_score(self, hotspot, risk_score):
        """
        Combine risk score with vulnerability/exposure.
        """
        
        # Factor 1: Population exposure (buildings, settlements nearby)
        building_count = hotspot['building_count_1km']
        settlement_nearby = hotspot['nearest_settlement_distance_m'] < 2000
        
        population_exposure = (
            building_count * 0.05 +  # ~5 people per building estimate
            (50 * settlement_nearby)  # +50 for nearby settlement
        )
        
        # Factor 2: Critical infrastructure
        critical_facility_distance = hotspot['nearest_critical_facility_distance_m']
        infrastructure_risk = (
            100 if critical_facility_distance < 500 else
            50 if critical_facility_distance < 1000 else
            0
        )
        
        # Factor 3: Environmental/economic
        forest_proximity = 1.0 if hotspot['is_vegetation'] else 0.3
        agricultural_value = 0.5 if hotspot['is_cropland'] else 0
        
        # Combined consequence score (0-100)
        consequence_score = (
            (population_exposure / 500) * 30 +  # Population impact
            infrastructure_risk * 0.4 +           # Infrastructure
            forest_proximity * 20 +               # Environmental
            agricultural_value * 10               # Economic
        )
        
        return {
            "consequence_score": min(100, consequence_score),
            "affected_population_estimate": int(population_exposure),
            "critical_facility_nearby": critical_facility_distance < 2000,
            "environmental_impact": "high" if forest_proximity > 0.7 else "low",
            "recommended_priority": (
                "CRITICAL" if consequence_score > 70 else
                "HIGH" if consequence_score > 50 else
                "MEDIUM"
            )
        }

# Combined risk + consequence
{
    "alert_id": 1001,
    "risk_score": 65,           # Technical risk
    "consequence_score": 78,    # Real-world impact
    "combined_priority": 85,    # Send alert to senior operator
    "affected_people": 250,     # ~250 people in danger
    "action": "EVACUATE_NOW"
}
```

#### Why This Helps
✅ Same risk score ≠ same priority (context matters)  
✅ Route high-consequence alerts to senior decision makers  
✅ Operators understand stakes: "Risk 65 but 250 people in danger"

---

### **6. CROSS-FACILITY CORRELATION** ⭐⭐⭐
**Value:** Medium | **Effort:** Medium | **2-Day Feasible?** ✅ Partially

#### Problem
```
Facility A detects fire → Alert
Facility B (3km away) also detects unusual activity → Second alert

Are these related? Separate incidents? Same fire?

Not asking: "Is facility B's signal real?" 
But asking: "Are they connected?"
```

#### Solution
```python
class FacilityCrossCorrelation:
    """Detect if multiple facilities show correlated anomalies."""
    
    def check_cross_facility_signals(self, hotspot, nearby_facilities_1km=3):
        """
        When hotspot detected:
        1. Find nearby facilities
        2. Check if their FRP also unusual
        3. Boost confidence if correlated
        """
        
        # Find facilities within 3 km
        nearby_facilities = db.query(
            "SELECT * FROM facilities WHERE ST_DWithin(geom, $1, 3000)",
            [hotspot.geom]
        )
        
        correlated_signals = []
        for facility in nearby_facilities:
            # Check if this facility's recent FRP is also elevated
            recent_frp = db.query(
                "SELECT frp FROM hotspots WHERE facility_id = $1 "
                "AND acq_date >= NOW() - INTERVAL '6 hours' "
                "ORDER BY acq_date DESC LIMIT 10",
                [facility.id]
            )
            
            if recent_frp:
                avg_recent_frp = np.mean([r['frp'] for r in recent_frp])
                facility_baseline = self._get_facility_baseline(facility.id)
                
                if avg_recent_frp > facility_baseline * 1.5:
                    correlated_signals.append({
                        "facility_id": facility.id,
                        "facility_name": facility.name,
                        "distance_m": hotspot.distance_to(facility),
                        "frp_anomaly": avg_recent_frp / facility_baseline
                    })
        
        return {
            "is_isolated": len(correlated_signals) == 0,
            "correlated_facilities": correlated_signals,
            "confidence_boost": min(0.3, len(correlated_signals) * 0.1),  # +30% max
            "interpretation": (
                "Isolated hotspot" if len(correlated_signals) == 0 else
                f"Correlated with {len(correlated_signals)} nearby facilities → Higher confidence"
            )
        }
```

#### Why This Helps
✅ Distinguish single false alarm from real incident  
✅ "Multiple sensors agree" = higher confidence  
✅ Reduce false positives: "Only 1 facility showed anomaly = probably false"

---

## 📊 QUICK RANKING: What to Add After Risk Score

### **Impact vs Effort Matrix**

| Enhancement | Impact | Effort | 2-Day? | Priority |
|-------------|--------|--------|--------|----------|
| **Confidence Calibration** | ⭐⭐⭐⭐⭐ | Medium | ✅ | 🥇 1st |
| **Temporal Tracking** | ⭐⭐⭐⭐⭐ | Medium | ✅ | 🥇 1st |
| **Operator Feedback Loop** | ⭐⭐⭐⭐⭐ | Low | ✅ | 🥇 1st |
| **Predictive Priority** | ⭐⭐⭐⭐ | Medium | ✅ | 🥈 2nd |
| **Cross-Facility Correlation** | ⭐⭐⭐ | Medium | ⚠️ | 🥈 2nd |
| **Consequence Modeling** | ⭐⭐⭐⭐ | High | ❌ | 🥉 3rd |
| **Weather Integration** | ⭐⭐⭐ | Medium | ❌ | 🥉 3rd |

---

## 🚀 RECOMMENDATION FOR 2-DAY SPRINT

**Add ONE of these after FRP Forecasting:**

### **Option A: Operator Feedback Loop** (Fastest)
- Add 1 new database table
- Add 1 Express endpoint
- Minimal code
- **Time: 2-3 hours**
- **Value: High** (enables continuous improvement)

### **Option B: Temporal Tracking** (Most Impactful)
- Cluster hotspots spatial-temporally
- Track fire spread
- Detect escalation
- **Time: 4-5 hours**
- **Value: Very High** (reduces false alerts, detects spreading)

### **Option C: Confidence Calibration** (Best Balance)
- Calculate uncertainty bands
- Adjust alert routing
- Interpretable scores
- **Time: 3-4 hours**
- **Value: High** (operators trust scores more)

---

## 📝 CONCRETE NEXT STEPS

**If you have 30 minutes after FRP Forecasting:**
```python
# Add to risk engine
def calculate_confidence(risk_score, factors):
    # Returns {risk_score, confidence, range_lower, range_upper}
    # Takes 30 min to add
```

**If you have 2 hours after FRP Forecasting:**
```python
# Add operator feedback table + endpoint
# Enables learning from real outcomes
```

**If you have 4 hours after FRP Forecasting:**
```python
# Add temporal hotspot clustering
# Detects spreading fires, reduces false alerts by ~20-40%
```

---

Which of these resonates most with your use case? I can provide step-by-step implementation for any of them.
