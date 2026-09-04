import sys
from pathlib import Path
import pandas as pd
import json

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.config import OUTPUT_DIR
from ml.features.engineer import FireFeatureEngineer
from ml.risk.engine import RiskEngine

def main():
    enriched_path = OUTPUT_DIR / "enriched_gujarat.parquet"
    if not enriched_path.exists():
        print("Enriched data not found. Run run_enrichment.py first.")
        return

    print("Loading enriched records...")
    df = pd.read_parquet(enriched_path)
    print(f"Records: {len(df)}")

    engineer = FireFeatureEngineer()
    risk_engine = RiskEngine()

    print("Engineering features...")
    feature_df = engineer.to_dataframe(df.to_dict('records'))

    print("Running risk engine...")
    risk_results = risk_engine.evaluate_batch(feature_df.to_dict('records'))

    # Combine results
    result_df = feature_df.copy()
    result_df["risk_score"] = [r["risk_score"] for r in risk_results]
    result_df["risk_level"] = [r["risk_level"] for r in risk_results]
    result_df["risk_reasons"] = ["; ".join(r["reasons"]) for r in risk_results]

    # Add original identifiers if present
    if "latitude" in df.columns and "longitude" in df.columns:
        result_df["latitude"] = df["latitude"]
        result_df["longitude"] = df["longitude"]

    out_path = OUTPUT_DIR / "risk_assessments.parquet"
    result_df.to_parquet(out_path, index=False)
    print(f"Saved risk assessments to {out_path}")

    # Show summary
    print("\nRisk Level Distribution:")
    print(result_df["risk_level"].value_counts().sort_index())
    print("\nSample assessments:")
    print(result_df[["risk_score", "risk_level", "risk_reasons"]].head(10).to_string(index=False))

if __name__ == "__main__":
    main()