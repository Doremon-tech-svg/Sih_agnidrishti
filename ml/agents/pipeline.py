"""
Full multi‑agent pipeline: Detector → Skeptic → Dispatcher → API writeback.
Writes run status to ml/output/last_run.json for the frontend.
"""

import json
import sys
import time
from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.config import OUTPUT_DIR, API_BASE
from ml.agents.detector import run_batch as detector_batch
from ml.agents.skeptic import run_batch as skeptic_batch
from ml.agents.dispatcher import run_batch as dispatcher_batch
from ml.api.client import patch_hotspot, post_incident

STATUS_FILE = OUTPUT_DIR / "last_run.json"


def load_risk_assessments():
    path = OUTPUT_DIR / "risk_assessments.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run run_risk_assessment.py first.")
    df = pd.read_parquet(path)
    return df.to_dict('records')


def run_pipeline(write_back=False):
    print("Loading risk assessments...")
    records = load_risk_assessments()
    print(f"Total records: {len(records)}")

    print("Running Agent 1 (Detector)...")
    flagged1, skipped1 = detector_batch(records)
    print(f"  FLAGGED: {len(flagged1)} | SKIPPED: {len(skipped1)}")

    print("Running Agent 2 (Skeptic)...")
    flagged2, debunked = skeptic_batch(flagged1)
    print(f"  FLAGGED: {len(flagged2)} | DEBUNKED: {len(debunked)}")

    print("Running Agent 3 (Dispatcher)...")
    dispatched = dispatcher_batch(flagged2)
    print(f"  Dispatched: {len(dispatched)}")

    priority_counts = {}
    for h in dispatched:
        p = h["agent3"]["threat_priority"]
        priority_counts[p] = priority_counts.get(p, 0) + 1
    print(f"  Priority distribution: {priority_counts}")

    # Save agent results
    results_df = pd.DataFrame(dispatched)
    out_path = OUTPUT_DIR / "agent_results.parquet"
    results_df.to_parquet(out_path, index=False)
    print(f"Saved agent results to {out_path}")

    patch_ok = patch_fail = 0
    incident_ok = incident_fail = 0

    if write_back:
        print("Writing back to backend...")
        for h in dispatched:
            hid = h.get("id")
            if not hid:
                continue
            try:
                patch_hotspot(hid, {
                    "classification": h.get("classification", "Unknown"),
                    "class_confidence": h.get("confidence_score", 0.5),
                    "risk_score": h["agent3"]["risk_score"],
                    "explanation": h["agent3"]["reason"]
                })
                patch_ok += 1
            except Exception as e:
                patch_fail += 1
            # Only create incidents for HIGH/CRITICAL
            if h["agent3"]["threat_priority"] in ("HIGH", "CRITICAL"):
                try:
                    post_incident(h["incident_payload"])
                    incident_ok += 1
                except Exception as e:
                    incident_fail += 1
        print(f"  PATCH hotspots: {patch_ok} ok / {patch_fail} fail")
        print(f"  POST incidents: {incident_ok} ok / {incident_fail} fail")

    summary = {
        "total": len(records),
        "skipped": len(skipped1),
        "debunked": len(debunked),
        "validated": len(dispatched),
        "patched": patch_ok,
        "incidents": incident_ok,
        "priority_counts": priority_counts
    }

    # Write status file for frontend
    status = {
        "status": "done",
        "started_at": None,
        "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "write_back": write_back,
        "summary": summary
    }
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)

    # Print JSON summary for backend parsing
    print(json.dumps(summary))

    return summary


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-back", action="store_true")
    args = parser.parse_args()
    summary = run_pipeline(write_back=args.write_back)
    print("\nPipeline Summary:")
    for k, v in summary.items():
        print(f"  {k}: {v}")