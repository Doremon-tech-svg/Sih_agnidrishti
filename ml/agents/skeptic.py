"""
Agent 2 — False-Positive Suppressor
Applies rules to remove known non‑hazardous detections.
"""

NIGHTFIRE_MATCH_CONF = 0.7   # If nightfire match and low risk, suppress
NORMAL_RISK_THRESHOLD = 30.0  # Risk below this is likely routine

def run(hotspot: dict) -> dict:
    risk_score = float(hotspot.get("risk_score", 0.0))
    nightfire = hotspot.get("nightfire") or {}
    is_nightfire_match = int(nightfire.get("is_nightfire_match", 0)) if isinstance(nightfire, dict) else 0

    # Rule 1: Low-risk nightfire match (gas flare routine)
    if is_nightfire_match and risk_score < NORMAL_RISK_THRESHOLD:
        return {**hotspot, "agent2": {"status": "DEBUNKED", "rule": "S1", "reason": "Routine nightfire/gas flare"}}

    # Rule 2: Very low risk + low FRP → false positive
    if risk_score < 10 and float(hotspot.get("frp", 0)) < 2.0:
        return {**hotspot, "agent2": {"status": "DEBUNKED", "rule": "S2", "reason": "Low intensity, low risk"}}

    return {**hotspot, "agent2": {"status": "FLAGGED", "rule": "PASS", "reason": "Survived suppression checks"}}

def run_batch(flagged):
    final_flag, debunked = [], []
    for h in flagged:
        result = run(h)
        if result["agent2"]["status"] == "FLAGGED":
            final_flag.append(result)
        else:
            debunked.append(result)
    return final_flag, debunked