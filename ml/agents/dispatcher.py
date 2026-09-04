"""
Agent 3 — Dispatcher
Creates final incident payload with risk assessment and priority.
"""

def threat_priority(risk_score):
    if risk_score >= 80:
        return "CRITICAL", 3
    if risk_score >= 65:
        return "HIGH", 2
    if risk_score >= 35:
        return "MODERATE", 1
    return "LOW", 1

def run(hotspot: dict) -> dict:
    risk = float(hotspot.get("risk_score", 0.0))
    priority, tier = threat_priority(risk)
    incident_payload = {
        "hotspot_id": hotspot.get("id"),
        "agent1": hotspot.get("agent1"),
        "agent2": hotspot.get("agent2"),
        "agent3": {
            "risk_score": risk,
            "threat_priority": priority,
            "tier": tier,
            "status": "VALIDATED"
        },
        "status": "VALIDATED",
        "threat_priority": priority
    }
    return {**hotspot, "agent3": incident_payload["agent3"], "incident_payload": incident_payload}

def run_batch(flagged):
    return [run(h) for h in flagged]