# AgniDrishti Backend Presentation Guide

## One-line opening

AgniDrishti does not stop at detecting a hot pixel. It combines satellite thermal observations with geographic context, machine learning, historical behavior, and explainable risk rules to decide what the event is, whether it is abnormal, and how urgently it needs attention.

## End-to-end flow

```text
NASA FIRMS
  -> parse, validate, normalize
  -> WorldCover + OpenStreetMap enrichment
  -> unified dataset
  -> 33 numerical features
  -> ML threat classification
  -> facility-level FRP anomaly detection
  -> Detector -> Skeptic -> Dispatcher
  -> explainable risk score and priority
  -> PostgreSQL/PostGIS hotspots, incidents, alerts
  -> protected Express APIs and GIS dashboard
```

## Recommended slide sequence

### Slide 1: Problem

NASA FIRMS tells us where a thermal anomaly was observed, but not whether it is a refinery incident, agricultural burning, wildfire, routine industrial activity, or a false positive.

The system converts detection into an operational decision: classify, verify, prioritize, explain, and notify.

### Slide 2: Data collection

Primary source: NASA FIRMS / VIIRS observations. Each event contributes coordinates, acquisition date and time, brightness temperature, FRP, confidence, and satellite information.

Supporting sources:

- OpenStreetMap: roads, buildings, settlements, industrial areas, water, and points of interest.
- ESA WorldCover: land-cover class at the hotspot coordinate.
- Historical hotspot records: facility-level behavioral baseline.

Implementation entry points:

- `backend/scripts/fetchFirms.js`: API collection and POST to the backend.
- `backend/app/ingestion/firms/`: parser, validator, and normalizer.
- `backend/scripts/fetchFacilities.js`: industrial facility collection from Overpass.

Say: "The satellite gives us the signal; the map and history give that signal meaning."

### Slide 3: Validation and enrichment

For every raw FIRMS record:

1. Parse the source file or API response.
2. Validate coordinates, date/time, FRP, confidence, and satellite fields.
3. Normalize field names and numeric values.
4. Sample WorldCover at the coordinate.
5. Query OSM context within the configured search radius.
6. Preserve invalid records and enrichment failures for auditability instead of silently discarding them.

Main implementation: `backend/app/ingestion/integration/firms_unified.py`.

Output: one unified hotspot record containing the original observation plus `landcover` and `osm` context.

### Slide 4: Feature engineering

The nested record is converted into a fixed 33-column numerical vector so that the same contract is used by training and inference.

Feature groups:

- Thermal: FRP, brightness, confidence.
- Temporal: acquisition hour, month, night indicator.
- Land cover: cropland, vegetation, built-up, bare-land indicators.
- Spatial context: distances to roads, buildings, settlements, industry, and water.
- Density and proximity: building, industrial, settlement, water, and POI counts/flags.

Missing spatial distances use a conservative maximum-distance default. The dataset loader checks that the final matrix contains zero NaNs.

Main implementation: `backend/app/features/engineer.py`, `schema.py`, and `transformers.py`.

### Slide 5: ML training

The current `backend/app/ml` training path uses four threat classes:

0. Controlled / low-risk thermal activity
1. Agricultural / stubble burning
2. Wildfire / vegetation fuel fire
3. Critical industrial hazard fire

Training sequence:

1. Load unified CSV or Parquet data.
2. Enforce the 33-feature schema and impute missing values.
3. Use a stratified 80/20 train/test split.
4. Run stratified five-fold cross-validation.
5. Train LightGBM and Random Forest candidates.
6. Select the champion using held-out macro F1.
7. Save the model bundle and metadata.
8. Verify live inference on realistic scenarios.

Entry point: `python -m backend.app.ml.train_pipeline`.

Important wording: benchmark mode may use synthetic or rule-derived labels. Production training requires an explicit curated `threat_class` label. Do not present benchmark accuracy as field validation.

### Slide 6: Anomaly and multi-agent verification

Classification answers "what type might this be?" Anomaly detection answers "is this behavior unusual for this location?"

The anomaly pass compares current FRP with historical facility behavior and calculates a z-score. A high score means the event is unusual relative to that facility's normal pattern, not merely hot in absolute terms.

The live multi-agent path is:

- Detector: high recall; removes only very weak observations.
- Skeptic: checks for routine industrial activity, stable flares, low confidence, and other false-positive patterns.
- Dispatcher: combines class, confidence, FRP, anomaly evidence, and proximity into a priority.

The aim is staged verification: do not miss a real event early, then reduce noise before alerting operators.

Implementation: `ml/agents/pipeline.py`, `detector.py`, `skeptic.py`, and `dispatcher.py`.

### Slide 7: Explainable risk and alerting

The rule-based risk engine produces a 0-100 score and human-readable reasons. Its pillars are:

- Fire intensity and satellite confidence.
- Industrial hazard proximity.
- Human vulnerability: settlements and buildings.
- Fuel and spread conditions: vegetation, cropland, and roads.
- Water-body mitigation deduction.

The result is stored with the hotspot and can create an incident or alert. Operators see not only a priority, but why the system reached it.

Implementation: `backend/app/risk/engine.py` and `backend/app/risk/rules.py`.

### Slide 8: Backend and dashboard integration

The Express backend provides protected APIs for hotspots, facilities, incidents, alerts, and ML operations.

- `POST /api/ml/run` starts the multi-agent pipeline asynchronously.
- `GET /api/ml/status` reports the last run.
- `POST /api/ml/predict` returns a single-record prediction.
- Hotspot updates and incident creation write results back to PostgreSQL/PostGIS.
- The frontend consumes these APIs for the map, facility history, ML panel, incident feed, and alerts.

The database provides spatial indexing and joins between hotspots and facilities, so the frontend receives operational results instead of recomputing geospatial logic in the browser.

## Two-minute spoken walkthrough

"First, NASA FIRMS supplies a thermal observation with location, time, FRP, brightness, and confidence. We validate and normalize it, then enrich the same coordinate using WorldCover and OpenStreetMap. This tells us whether the event is in cropland, vegetation, a built-up area, near a refinery, near buildings, or close to a road or water body.

Next, feature engineering converts those heterogeneous values into a fixed 33-feature vector. The classifier estimates one of four threat categories and returns confidence and class probabilities. In parallel, the anomaly module compares the event's FRP against historical behavior for that facility, so a routine flare and an unusual flare are treated differently.

The multi-agent layer then verifies the result. The Detector keeps recall high, the Skeptic tries to disprove routine or weak signals, and the Dispatcher assigns operational priority. Finally, the explainable risk engine combines intensity, industrial exposure, human vulnerability, spread conditions, and mitigation into a 0-to-100 score with reasons. The backend writes the result to PostGIS, creates incidents for serious events, and exposes the outcome through protected APIs to the GIS dashboard."

## Demo plan

1. Open the dashboard and show the hotspot map.
2. Select one hotspot near an industrial facility.
3. Point out raw signal values: FRP, brightness, confidence, date/time.
4. Show context: nearest industry, buildings, settlement, road, land cover.
5. Show classification and confidence.
6. Show anomaly score or historical facility behavior.
7. Show risk score, tier, and generated reasons.
8. Show the alert or incident record.
9. Trigger `POST /api/ml/run` only if the environment is already configured; otherwise use the existing result and explain that the endpoint runs asynchronously.

For a backend-only rehearsal from the repository root:

```powershell
python -m pytest backend/app -q
python -m backend.app.ml.train_pipeline --allow-synthetic --samples 600
```

Use `--allow-synthetic` only for a demonstration. For production training, omit it and provide curated `threat_class` labels.

## Judge questions and compact answers

### Why not use satellite data alone?

A hotspot is a detection, not an explanation. Land cover, industrial proximity, human exposure, and historical behavior are needed to distinguish routine heat from a dangerous event.

### Why use both ML and rules?

ML handles multi-source patterns and classification. Rules provide transparent safety logic and human-readable reasons. The two roles complement each other: prediction for pattern recognition, rules for accountability and operational thresholds.

### How do you handle false positives?

The Detector preserves recall, the Skeptic applies suppression checks, historical anomaly analysis identifies unusual behavior, and the final risk/priority stage prevents every detection from becoming an emergency alert.

### How do you avoid data leakage?

The training contract separates features from `threat_class`, uses a stratified held-out test set and cross-validation, and rejects production training without explicit labels. Synthetic and rule-derived labels are explicitly benchmark-only.

### What is the current limitation?

This is a strong prototype, not a claim of completed field deployment. The repository still has parallel legacy and current ML paths, and production hardening requires unified taxonomies, curated labels, automated migrations, authenticated ingestion, and environment-specific process configuration.

### How would you scale it?

Use scheduled/batch ingestion, a persistent inference service instead of spawning Python for every request, queue-based processing, partitioned spatial/temporal tables, model versioning, and feedback from confirmed incidents.

## Do not overclaim

- Say "four-class current training path" rather than claiming the entire repository uses one taxonomy.
- Say "benchmark metrics" when synthetic or rule-derived labels are used.
- Treat README-only sources such as WorldPop, Nightfire, and power-plant data as planned or architectural unless they are present in the active run.
- Do not claim every ingestion script is production-ready without checking authentication and Windows process configuration.

## Closing line

"AgniDrishti turns an isolated satellite detection into an explainable operational decision: what happened, whether it is abnormal, how dangerous it is, and who should act."
