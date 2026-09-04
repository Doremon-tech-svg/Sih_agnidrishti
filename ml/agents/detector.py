"""
Agent 1 — High-Recall Detector
Flags hotspots that exceed minimum signal thresholds.
"""

MIN_FRP = 0.5
MIN_CONFIDENCE = 0.3   # corresponds to low-confidence threshold

def run(hotspot: dict) -> dict:
    frp = float(hotspot.get("frp", 0.0))
    confidence = float(hotspot.get("confidence_score", 0.5))

    if frp < MIN_FRP:
        return {**hotspot, "agent1": {"status": "SKIPPED", "reason": f"FRP {frp} below {MIN_FRP} MW"}}
    if confidence < MIN_CONFIDENCE:
        return {**hotspot, "agent1": {"status": "SKIPPED", "reason": f"Confidence {confidence} below threshold"}}

    return {**hotspot, "agent1": {"status": "FLAGGED", "reason": "Passed detection thresholds"}}

def run_batch(records):
    flagged, skipped = [], []
    for r in records:
        result = run(r)
        if result["agent1"]["status"] == "FLAGGED":
            flagged.append(result)
        else:
            skipped.append(result)
    return flagged, skipped