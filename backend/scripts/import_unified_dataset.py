"""Import generated unified hotspot CSV files into PostgreSQL/PostGIS."""

import json
import os
from pathlib import Path

import pandas as pd
import psycopg


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "processed" / "unified"


def import_dataset() -> int:
    files = sorted(DATA_DIR.glob("*_unified.csv"))
    files = [path for path in files if path.stem != "gujarat_consolidated_unified"]
    if not files:
        raise FileNotFoundError(f"No city unified CSV files found in {DATA_DIR}")

    rows = []
    for path in files:
        frame = pd.read_csv(path)
        for record in frame.to_dict(orient="records"):
            rows.append((
                str(record["event_id"]),
                float(record["latitude"]),
                float(record["longitude"]),
                str(record.get("satellite", "")),
                record.get("acquisition_date"),
                float(record.get("brightness", 0.0)),
                float(record.get("frp", 0.0)),
                str(record.get("confidence_score", "")),
                record.get("classification"),
                float(record.get("risk_score", 0.0)),
                str(record.get("risk_reasons", "")),
                json.dumps({"city": record.get("city"), "enrichment_mode": record.get("enrichment_mode")}),
            ))

    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://sih:sih@localhost:5432/firewatch"
    )
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO hotspots
                    (source_event_id, lat, lon, geom, satellite, acq_date,
                     brightness_ti4, frp, confidence, classification,
                     risk_score, explanation, raw)
                VALUES
                    (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                     %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source_event_id) DO UPDATE SET
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    geom = EXCLUDED.geom,
                    frp = EXCLUDED.frp,
                    risk_score = EXCLUDED.risk_score,
                    explanation = EXCLUDED.explanation,
                    raw = EXCLUDED.raw
                """,
                [(
                    event_id, lat, lon, lon, lat, satellite, acq_date,
                    brightness, frp, confidence, classification, risk_score,
                    explanation, raw,
                ) for (
                    event_id, lat, lon, satellite, acq_date, brightness, frp,
                    confidence, classification, risk_score, explanation, raw,
                ) in rows],
            )
        connection.commit()
    return len(rows)


if __name__ == "__main__":
    print(f"Imported or updated {import_dataset()} unified hotspots.")