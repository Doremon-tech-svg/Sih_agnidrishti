"""
FastAPI service exposing AgniDrishti's backend/app ML pipeline for real-time
single-hotspot inference: feature engineering -> classification -> risk scoring.
"""
from typing import Any, Dict, Optional
from fastapi import FastAPI
from pydantic import BaseModel

from backend.app.features.engineer import FireFeatureEngineer
from backend.app.ml.predictor import FirePredictor
from backend.app.risk.engine import RiskEngine
from backend.app.agents.pipeline import IncidentPipeline

app = FastAPI(title="AgniDrishti ML Service")

engineer = FireFeatureEngineer()
predictor = FirePredictor()
risk_engine = RiskEngine()
incident_pipeline = IncidentPipeline()


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


@app.get("/health")
def health():
    return {"ok": True, "model": predictor.model_name, "version": predictor.metadata.get("version")}


@app.post("/predict")
def predict(record: HotspotRecord) -> Dict[str, Any]:
    raw = record.model_dump()
    features = engineer.transform_record(raw)

    ml_result = predictor.predict_record(features)

    risk = risk_engine.evaluate(features)

    ml_classification_for_gas = {
        "threat_class": ml_result["predicted_class"],
        "probability": ml_result["confidence"],
        "predicted_label": ml_result["threat_name"],
    }

    incident = incident_pipeline.process_record(
        {**features, "event_id": record.event_id},
        ml_classification=ml_classification_for_gas,
    )

    return {
        "event_id": record.event_id,
        "classification": ml_result["threat_name"],
        "threat_short_name": ml_result["threat_short_name"],
        "confidence": ml_result["confidence"],
        "severity_score": ml_result["severity_score"],
        "severity_tier": ml_result["severity_tier"],
        "class_probabilities": ml_result["class_probabilities"],
        "risk_score": risk["risk_score"],
        "risk_level": risk["risk_level"],
        "reasons": risk["reasons"],
        "incident_status": incident["status"],
        "dispatch_required": incident["dispatch_required"],
        "gas_so2_ppb": incident.get("gas_so2_ppb"),
        "gas_no2_ppb": incident.get("gas_no2_ppb"),
        "agent2_status": incident.get("agent2_status"),
        "agent2_recommendation": incident.get("agent2_recommendation"),
    }