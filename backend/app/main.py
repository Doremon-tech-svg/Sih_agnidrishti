"""
FastAPI service exposing AgniDrishti's ML pipeline for real-time
fire hotspot inference:
  feature engineering → classification → gas agent verification → risk scoring.

Endpoints:
  GET  /health              — liveness + model info
  POST /predict             — single hotspot → full ML + risk + incident result
  POST /predict/batch       — batch of hotspots
  POST /predict_single      — lightweight single record (backwards compat)
  POST /agent2/analyze      — gas detector verification only
  POST /pipeline/full       — one-shot: ML classify → agent2 verify → risk score
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.features.engineer import FireFeatureEngineer
from backend.app.ml.predictor import FirePredictor
from backend.app.risk.engine import RiskEngine
from backend.app.agents.pipeline import IncidentPipeline
from backend.app.agents.gas_detector import GasDetectorAnalyzer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agnidrishti.fastapi")

# ── App init ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="AgniDrishti ML Service",
    description="Fire hotspot classification, gas verification, and risk scoring API",
    version="2.0.0",
)

# Allow Express backend and frontend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Lazy-loaded singletons (avoid startup crash if model file missing) ─────
_engineer: Optional[FireFeatureEngineer] = None
_predictor: Optional[FirePredictor] = None
_risk_engine: Optional[RiskEngine] = None
_incident_pipeline: Optional[IncidentPipeline] = None
_gas_analyzer: Optional[GasDetectorAnalyzer] = None


def get_engineer() -> FireFeatureEngineer:
    global _engineer
    if _engineer is None:
        _engineer = FireFeatureEngineer()
    return _engineer


def get_predictor() -> FirePredictor:
    global _predictor
    if _predictor is None:
        _predictor = FirePredictor()
    return _predictor


def get_risk_engine() -> RiskEngine:
    global _risk_engine
    if _risk_engine is None:
        _risk_engine = RiskEngine()
    return _risk_engine


def get_incident_pipeline() -> IncidentPipeline:
    global _incident_pipeline
    if _incident_pipeline is None:
        _incident_pipeline = IncidentPipeline()
    return _incident_pipeline


def get_gas_analyzer() -> GasDetectorAnalyzer:
    global _gas_analyzer
    if _gas_analyzer is None:
        _gas_analyzer = GasDetectorAnalyzer()
    return _gas_analyzer


# ── Request models ────────────────────────────────────────────────────────

class LandCover(BaseModel):
    class_code: Optional[int] = 0


class OSMBuildings(BaseModel):
    count: int = 0
    nearest_distance_m: Optional[float] = None


class OSMSettlements(BaseModel):
    count: int = 0
    nearest_distance_m: Optional[float] = None


class OSMIndustrial(BaseModel):
    count: int = 0
    nearest_distance_m: Optional[float] = None


class OSMWater(BaseModel):
    count: int = 0
    nearest_distance_m: Optional[float] = None


class OSMContext(BaseModel):
    nearest_road_distance_m: Optional[float] = None
    nearby_roads: int = 0
    buildings: OSMBuildings = OSMBuildings()
    settlements: OSMSettlements = OSMSettlements()
    industrial_areas: OSMIndustrial = OSMIndustrial()
    water_bodies: OSMWater = OSMWater()
    poi_count: int = 0
    landuse_count: int = 0


class HotspotRecord(BaseModel):
    event_id: Optional[str] = None
    latitude: float
    longitude: float
    acquisition_date: Optional[str] = None
    acquisition_time: Optional[str] = None
    daynight: Optional[str] = "D"
    frp: float = 0.0
    bright_ti4: Optional[float] = None
    confidence: Optional[str] = None
    scan: Optional[float] = 1.0
    track: Optional[float] = 1.0
    landcover: Optional[LandCover] = None
    osm: Optional[OSMContext] = None


class MLClassification(BaseModel):
    threat_class: int
    probability: float
    predicted_label: str


class Agent2Payload(BaseModel):
    hotspot: Dict[str, Any]
    ml_classification: MLClassification


# ── Helpers ───────────────────────────────────────────────────────────────

def _build_full_result(record: HotspotRecord) -> Dict[str, Any]:
    """Run the complete pipeline for one hotspot: features -> ML classification
    -> Agent 2 gas verification -> risk scoring (gas-aware) -> incident status.
    Gas verification now runs BEFORE risk scoring for every caller of this
    function (/predict, /predict/batch, /pipeline/full) so it actually
    influences risk_score and dispatch_required, not just decoration after."""
    raw = record.model_dump()
    engineer = get_engineer()
    predictor = get_predictor()
    risk_engine = get_risk_engine()
    incident_pipeline = get_incident_pipeline()
    gas_analyzer = get_gas_analyzer()

    features = engineer.transform_record(raw)

    # Step 1: ML classification
    ml_result = predictor.predict_record(features)

    # Step 2: Agent 2 — gas verification, refines confidence before risk scoring
    ml_classification = {
        "threat_class": ml_result["predicted_class"],
        "probability": ml_result["confidence"],
        "predicted_label": ml_result["threat_name"],
    }
    gas_result = gas_analyzer.analyze_hotspot(raw, ml_classification)

    # Inject gas evidence into the feature dict so RiskEngine's gas pillar can see it
    features["agent2_status"] = gas_result["agent2_status"]
    features["gas_signature_match"] = gas_result["gas_analysis"]["gas_signature_match"]
    features["gas_so2_ppb"] = gas_result["gas_analysis"]["so2_ppb"]
    features["gas_no2_ppb"] = gas_result["gas_analysis"]["no2_ppb"]

    refined_confidence = gas_result["refined_probability"]

    # Step 3: Risk scoring — now gas-aware
    risk = risk_engine.evaluate(features)

    # Step 4: Incident decision
    incident = incident_pipeline.process_record({
        **features,
        "event_id": record.event_id,
        "confidence_score": refined_confidence,
    })

    return {
        "event_id": record.event_id,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "classification": ml_result["threat_name"],
        "threat_short_name": ml_result["threat_short_name"],
        "predicted_class": ml_result["predicted_class"],
        "confidence": round(refined_confidence, 4),
        "original_ml_confidence": round(ml_result["confidence"], 4),
        "severity_score": ml_result["severity_score"],
        "severity_tier": ml_result["severity_tier"],
        "class_probabilities": ml_result["class_probabilities"],
        "risk_score": risk["risk_score"],
        "risk_level": risk["risk_level"],
        "reasons": risk["reasons"],
        "incident_status": incident["status"],
        "dispatch_required": incident["dispatch_required"],
        "agent2_status": gas_result["agent2_status"],
        "agent2_recommendation": gas_result["recommendation"],
        "gas_analysis": gas_result["gas_analysis"],
        "confidence_delta": gas_result["confidence_delta"],
        "flags": gas_result["flags"],
    }


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Liveness check with model metadata."""
    try:
        predictor = get_predictor()
        return {
            "ok": True,
            "service": "AgniDrishti ML",
            "version": "2.0.0",
            "model": predictor.model_name,
            "model_version": predictor.metadata.get("version"),
            "trained_at": predictor.metadata.get("trained_at"),
        }
    except Exception as e:
        logger.warning(f"Model not loaded: {e}")
        return {"ok": False, "service": "AgniDrishti ML", "version": "2.0.0", "model": None, "error": str(e)}


@app.post("/predict")
def predict(record: HotspotRecord) -> Dict[str, Any]:
    """
    Full single-hotspot pipeline:
    features → ML classification → risk score → incident status.
    """
    try:
        return _build_full_result(record)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=f"Model not trained yet: {e}")
    except Exception as e:
        logger.error(f"/predict error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/batch")
def predict_batch(records: List[HotspotRecord]) -> List[Dict[str, Any]]:
    """
    Batch classification for multiple hotspots.
    Processes each record through the full pipeline.
    """
    if not records:
        return []
    if len(records) > 500:
        raise HTTPException(status_code=400, detail="Batch limited to 500 records.")

    results = []
    for record in records:
        try:
            results.append(_build_full_result(record))
        except Exception as e:
            logger.warning(f"Batch record error at {record.event_id}: {e}")
            results.append({
                "event_id": record.event_id,
                "latitude": record.latitude,
                "longitude": record.longitude,
                "error": str(e),
            })
    return results


@app.post("/predict_single")
def predict_single(record: HotspotRecord) -> Dict[str, Any]:
    """
    Lightweight single-record prediction adapter for external callers.
    Returns the minimal dict expected by legacy code/tests.
    """
    try:
        raw = record.model_dump()
        features = get_engineer().transform_record(raw)
        return get_predictor().predict_single(features)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent2/analyze")
def agent2_analyze(payload: Agent2Payload) -> Dict[str, Any]:
    """
    Run GasDetectorAnalyzer (Agent 2) SO2/NO2 verification.

    Input:
        hotspot: raw hotspot dict with lat/lon/acq_date
        ml_classification: {threat_class, probability, predicted_label}

    Returns refined classification with gas analysis metadata.
    """
    try:
        analyzer = get_gas_analyzer()
        result = analyzer.analyze_hotspot(
            payload.hotspot,
            {
                "threat_class": payload.ml_classification.threat_class,
                "probability": payload.ml_classification.probability,
                "predicted_label": payload.ml_classification.predicted_label,
            }
        )
        return result
    except Exception as e:
        logger.error(f"/agent2/analyze error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/full")
def pipeline_full(record: HotspotRecord) -> Dict[str, Any]:
    """One-shot full pipeline: ML classification -> Agent2 gas verification
    (gas-aware) -> risk score. Identical to /predict — kept as a separate
    route name for backward-compatible callers."""
    try:
        return _build_full_result(record)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=f"Model not trained yet: {e}")
    except Exception as e:
        logger.error(f"/pipeline/full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))