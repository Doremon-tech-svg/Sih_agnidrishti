#!/usr/bin/env python3
"""
Generate a comprehensive DOCX document of the AgniDrishti project accomplishments.
"""

try:
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
except ImportError:
    print("Installing python-docx...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-docx", "-q"])
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

from datetime import datetime

def add_heading_style(doc, text, level=1):
    """Add a styled heading"""
    heading = doc.add_heading(text, level=level)
    if level == 1:
        heading.style = 'Heading 1'
        for run in heading.runs:
            run.font.color.rgb = RGBColor(192, 0, 0)  # Dark red
            run.font.size = Pt(16)
            run.bold = True
    elif level == 2:
        heading.style = 'Heading 2'
        for run in heading.runs:
            run.font.color.rgb = RGBColor(255, 102, 0)  # Orange
            run.font.size = Pt(14)
            run.bold = True
    return heading

def add_paragraph_with_bold(doc, bold_text, regular_text=""):
    """Add paragraph with bold and regular text"""
    p = doc.add_paragraph()
    if bold_text:
        run = p.add_run(bold_text)
        run.bold = True
    if regular_text:
        p.add_run(regular_text)
    return p

def create_project_document():
    """Create the comprehensive project document"""
    
    doc = Document()
    
    # Set default font
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(11)
    
    # ============== TITLE PAGE ==============
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('🔥 AgniDrishti')
    run.font.size = Pt(28)
    run.font.bold = True
    run.font.color.rgb = RGBColor(192, 0, 0)
    
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run('AI-Based Detection and Classification of Industrial Fires & Persistent Thermal Sources')
    run.font.size = Pt(14)
    run.italic = True
    
    project_code = doc.add_paragraph()
    project_code.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = project_code.add_run('SIH26162')
    run.font.size = Pt(12)
    run.bold = True
    
    doc.add_paragraph()  # Spacing
    
    desc = doc.add_paragraph()
    desc.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = desc.add_run('A geospatial decision-support system for detecting, classifying, verifying, and prioritizing abnormal thermal activity using satellite observations and multi-source geographic intelligence.')
    run.font.size = Pt(11)
    
    doc.add_paragraph()
    doc.add_paragraph()
    
    date_para = doc.add_paragraph()
    date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = date_para.add_run(f'Report Generated: {datetime.now().strftime("%B %d, %Y")}')
    run.font.italic = True
    
    doc.add_page_break()
    
    # ============== TABLE OF CONTENTS ==============
    add_heading_style(doc, 'Table of Contents', 1)
    toc_items = [
        '1. Executive Summary',
        '2. Problem Statement',
        '3. System Architecture',
        '4. Implemented Components',
        '5. Technology Stack',
        '6. Database Design',
        '7. Backend Implementation',
        '8. Frontend Implementation',
        '9. Machine Learning Pipeline',
        '10. Integration & APIs',
        '11. Testing & Quality Assurance',
        '12. Deployment & Infrastructure',
        '13. Current Accomplishments',
        '14. Key Features Implemented',
        '15. Known Limitations & Future Work'
    ]
    for item in toc_items:
        p = doc.add_paragraph(item, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 1. EXECUTIVE SUMMARY ==============
    add_heading_style(doc, '1. Executive Summary', 1)
    
    doc.add_paragraph(
        'AgniDrishti is an end-to-end AI-powered geospatial intelligence system designed to transform raw satellite thermal observations into actionable intelligence for detecting, classifying, and prioritizing industrial fires and persistent thermal anomalies.'
    )
    
    add_heading_style(doc, 'Mission', 2)
    doc.add_paragraph(
        'Convert isolated satellite thermal detections into explainable, verifiable operational decisions that answer: What happened? Is it abnormal? How dangerous is it? Who should act?'
    )
    
    add_heading_style(doc, 'Key Accomplishments', 2)
    accomplishments = [
        'End-to-end pipeline from NASA FIRMS satellite data to operational alerts',
        'Multi-source geospatial enrichment (OpenStreetMap, ESA WorldCover)',
        '33-feature engineering framework for ML model input',
        'Four-class threat classification system (LightGBM + Random Forest)',
        'Facility-level anomaly detection with z-score analysis',
        'Multi-agent verification pipeline (Detector → Skeptic → Dispatcher)',
        'Explainable risk scoring engine with human-readable reasons',
        'Production-ready Express.js backend with PostGIS database',
        'Interactive React/Vite frontend with 3D visualization',
        'Protected APIs with JWT authentication',
        'Real-time scheduling and notification system'
    ]
    for acc in accomplishments:
        doc.add_paragraph(acc, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 2. PROBLEM STATEMENT ==============
    add_heading_style(doc, '2. Problem Statement', 1)
    
    doc.add_paragraph(
        'NASA FIRMS provides thermal anomaly observations with location, acquisition time, brightness temperature, and FRP (Fire Radiative Power), but raw detections lack contextual information necessary for reliable operational decision-making.'
    )
    
    add_heading_style(doc, 'The Core Challenge', 2)
    doc.add_paragraph(
        'A satellite thermal detection at coordinates (22.57°N, 70.21°E) with FRP of 82 MW could represent:'
    )
    challenges = [
        'Wildfire requiring emergency response',
        'Agricultural burning requiring regulatory oversight',
        'Industrial furnace or routine activity (low priority)',
        'Gas flare from oil/gas installation (moderate priority)',
        'Industrial accident requiring immediate intervention',
        'Mining-related thermal activity',
        'False positive or sensor artifact'
    ]
    for challenge in challenges:
        doc.add_paragraph(challenge, style='List Bullet')
    
    add_heading_style(doc, 'Required Decision Chain', 2)
    decision_chain = [
        'Where is the hotspot? (NASA FIRMS)',
        'What is around it? (OSM / Land Cover)',
        'What type of thermal source? (ML Classifier)',
        'Is behavior normal? (Anomaly Detection)',
        'Can the alert be disproved? (Skeptic Agent)',
        'How dangerous is it? (Risk Engine)',
        'Who should be notified? (Dispatcher)',
        'Why was the alert generated? (Explainability)'
    ]
    for i, step in enumerate(decision_chain, 1):
        doc.add_paragraph(step, style='List Number')
    
    doc.add_page_break()
    
    # ============== 3. SYSTEM ARCHITECTURE ==============
    add_heading_style(doc, '3. System Architecture', 1)
    
    doc.add_paragraph(
        'AgniDrishti follows a modular, layered architecture from data ingestion through operational delivery:'
    )
    
    architecture_flow = """
    NASA FIRMS Data
            ↓
    [Ingestion & Validation Layer]
    - Parse FIRMS source
    - Validate coordinates, FRP, confidence
    - Normalize field names
            ↓
    [Enrichment Layer]
    - WorldCover land-cover classification
    - OpenStreetMap context extraction
    - Historical facility data linking
            ↓
    [Feature Engineering Layer]
    - Convert 33-feature numerical vector
    - Standardization and imputation
    - Schema validation
            ↓
    [ML Classification Layer]
    - Four-class threat prediction
    - Confidence scoring
    - Probability distribution
            ↓
    [Anomaly Detection Layer]
    - Historical facility behavior analysis
    - Z-score calculation
    - Abnormality flagging
            ↓
    [Multi-Agent Verification Layer]
    - Detector (high recall)
    - Skeptic (false-positive suppression)
    - Dispatcher (priority assignment)
            ↓
    [Risk Assessment & Explanation]
    - Rule-based risk scoring (0-100)
    - Human-readable reasons
    - Threat tier classification
            ↓
    [Data Persistence & APIs]
    - PostgreSQL/PostGIS database
    - Protected Express.js APIs
    - JWT authentication
            ↓
    [Frontend & Notifications]
    - Interactive React dashboard
    - Real-time alert feed
    - Multi-channel notifications (Twilio)
    """
    
    for line in architecture_flow.split('\n'):
        if line.strip():
            p = doc.add_paragraph(line)
            p.paragraph_format.left_indent = Inches(0.25)
            p.style = 'Normal'
    
    doc.add_page_break()
    
    # ============== 4. IMPLEMENTED COMPONENTS ==============
    add_heading_style(doc, '4. Implemented Components', 1)
    
    components = {
        'Data Ingestion': {
            'firms/': 'NASA FIRMS data collection and parsing',
            'osm/': 'OpenStreetMap data ingestion',
            'landcover/': 'ESA WorldCover classification',
            'integration/': 'firms_unified.py - Unified enrichment pipeline'
        },
        'Feature Engineering': {
            'features/engineer.py': 'Core feature transformation logic',
            'features/schema.py': '33-feature contract definition',
            'features/transformers.py': 'Categorical and numerical transformers'
        },
        'Machine Learning': {
            'ml/train_pipeline.py': 'Training orchestration (LightGBM + Random Forest)',
            'ml/predictor.py': 'Single-record and batch inference',
            'ml/evaluator.py': 'Cross-validation and performance metrics',
            'ml/models/': 'Serialized model artifacts',
            'dataset.py': 'Data loading and validation'
        },
        'Anomaly Detection': {
            'anomaly/detector.py': 'Z-score based facility-level anomaly scoring',
            'anomaly/test_detector.py': 'Detector unit tests'
        },
        'Multi-Agent Pipeline': {
            'agents/pipeline.py': 'Detector → Skeptic → Dispatcher orchestration',
            'agents/detector.py': 'High-recall initial filtering',
            'agents/skeptic.py': 'False-positive suppression logic'
        },
        'Risk Assessment': {
            'risk/engine.py': '0-100 risk score calculation',
            'risk/rules.py': 'Explainable rule definitions'
        }
    }
    
    for category, files in components.items():
        add_heading_style(doc, category, 2)
        for filename, description in files.items():
            add_paragraph_with_bold(doc, f'{filename}: ', description)
    
    doc.add_page_break()
    
    # ============== 5. TECHNOLOGY STACK ==============
    add_heading_style(doc, '5. Technology Stack', 1)
    
    stack = {
        'Backend Runtime': ['Node.js (Express.js v5.0.0)', 'Python 3.13+'],
        'Frontend': ['React 19.0', 'Vite 6.0', 'React-Leaflet 5.0', 'Three.js 0.185'],
        'Database': ['PostgreSQL 12+', 'PostGIS 3.0+ (Spatial Extension)'],
        'ML Libraries': [
            'LightGBM 4.0+ (primary classifier)',
            'scikit-learn 1.3 (ensemble methods)',
            'pandas 2.1+ (data manipulation)',
            'NumPy 1.26+ (numerical computing)'
        ],
        'Authentication': ['JWT (jsonwebtoken 9.0)', 'bcryptjs 3.0'],
        'Notifications': ['Twilio 5.3 (SMS/WhatsApp alerts)'],
        'Data Serialization': ['PyArrow 14+ (Parquet support)'],
        'Task Scheduling': ['node-cron 4.6 (async job scheduling)'],
        'Testing': ['pytest 8+ (Python)', 'Jest (JavaScript)'],
        'DevOps': ['Docker & Docker Compose', 'Node.js watcher mode']
    }
    
    for category, technologies in stack.items():
        add_heading_style(doc, category, 2)
        for tech in technologies:
            doc.add_paragraph(tech, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 6. DATABASE DESIGN ==============
    add_heading_style(doc, '6. Database Design', 1)
    
    doc.add_paragraph(
        'The system uses PostgreSQL with PostGIS extension for spatial indexing and geospatial joins. The schema models the complete lifecycle from raw observation to alert.'
    )
    
    tables = {
        'facilities': {
            'purpose': 'Industrial installations (refineries, power plants, mining, LNG terminals)',
            'key_fields': [
                'id (Primary Key)',
                'name, type (facility classification)',
                'osm_id (OpenStreetMap reference)',
                'geom (GEOMETRY/Polygon - spatial footprint)',
                'created_at (timestamp)'
            ]
        },
        'hotspots': {
            'purpose': 'Satellite thermal observations with enrichment and ML results',
            'key_fields': [
                'id (Primary Key)',
                'source_event_id (unique per FIRMS record)',
                'lat, lon (coordinates)',
                'geom (GEOMETRY/Point - spatial index)',
                'satellite, acq_date (observation metadata)',
                'brightness_ti4, frp, confidence (thermal signal)',
                'classification, class_confidence (ML prediction)',
                'risk_score (explainable risk 0-100)',
                'facility_id (FK to linked facility)',
                'explanation (human-readable reasons)',
                'raw (JSONB for arbitrary extended data)'
            ]
        },
        'incidents': {
            'purpose': 'Multi-agent verification results per hotspot',
            'key_fields': [
                'id (Primary Key)',
                'hotspot_id (FK)',
                'agent1, agent2, agent3 (JSONB - Detector, Skeptic, Dispatcher outputs)',
                'status (FLAGGED, DEBUNKED, VALIDATED)',
                'threat_priority (LOW/MODERATE/HIGH/CRITICAL)',
                'created_at (timestamp)'
            ]
        },
        'alerts': {
            'purpose': 'Notifications sent to operators',
            'key_fields': [
                'id (Primary Key)',
                'incident_id (FK)',
                'tier (1-4 priority scale)',
                'message (notification text)',
                'sent_at (timestamp)'
            ]
        }
    }
    
    for table_name, table_info in tables.items():
        add_heading_style(doc, f'Table: {table_name}', 2)
        add_paragraph_with_bold(doc, 'Purpose: ', table_info['purpose'])
        doc.add_paragraph('Key Fields:', style='Normal')
        for field in table_info['key_fields']:
            doc.add_paragraph(field, style='List Bullet')
    
    add_heading_style(doc, 'Spatial Indexes', 2)
    doc.add_paragraph('The schema includes GIST indexes on geometry columns for efficient spatial queries:', style='Normal')
    indexes = [
        'hotspots_geom_idx (Point geometry)',
        'facilities_geom_idx (Polygon geometry)',
        'hotspots_acq_date_idx (temporal queries)',
        'hotspots_classification_idx (threat-class filtering)'
    ]
    for idx in indexes:
        doc.add_paragraph(idx, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 7. BACKEND IMPLEMENTATION ==============
    add_heading_style(doc, '7. Backend Implementation', 1)
    
    add_heading_style(doc, 'Express.js API Routes', 2)
    
    api_routes = {
        '/api/auth': 'User authentication, JWT token generation',
        '/api/hotspots': 'CRUD operations on hotspot records with spatial filtering',
        '/api/facilities': 'Industrial facility management and geolocation',
        '/api/incidents': 'Multi-agent verification results retrieval',
        '/api/alerts': 'Alert feed and notification history',
        '/api/ml/run': 'Trigger multi-agent pipeline asynchronously',
        '/api/ml/status': 'Check status of last ML run',
        '/api/ml/predict': 'Single-record threat classification'
    }
    
    for route, description in api_routes.items():
        add_paragraph_with_bold(doc, f'{route}: ', description)
    
    add_heading_style(doc, 'Middleware & Security', 2)
    
    doc.add_paragraph('authMiddleware.js: JWT token validation and user context injection')
    doc.add_paragraph('errorHandler.js: Centralized error handling and logging')
    doc.add_paragraph('CORS configuration: Cross-origin resource sharing for frontend integration')
    doc.add_paragraph('bcryptjs: Password hashing and verification')
    
    add_heading_style(doc, 'Database Connection', 2)
    
    doc.add_paragraph('db.js: PostgreSQL connection pooling using pg library')
    doc.add_paragraph('Post-GIS queries for spatial joins between hotspots and facilities')
    doc.add_paragraph('Transaction support for atomic multi-table updates')
    
    add_heading_style(doc, 'Asynchronous Operations', 2)
    
    doc.add_paragraph('scheduler.js: node-cron based job scheduling for periodic FIRMS data fetch')
    doc.add_paragraph('notify.js: Twilio integration for SMS/WhatsApp alerts')
    doc.add_paragraph('mlBridge.js: Python subprocess orchestration for ML pipeline execution')
    
    doc.add_page_break()
    
    # ============== 8. FRONTEND IMPLEMENTATION ==============
    add_heading_style(doc, '8. Frontend Implementation', 1)
    
    add_heading_style(doc, 'Core Pages & Components', 2)
    
    components_frontend = {
        'App.jsx': 'Main application component and routing',
        'Dashboard.jsx': 'Central operational dashboard',
        'MapView.jsx': 'Interactive Leaflet/MapLibre map visualization',
        'AlertFeed.jsx': 'Real-time alert notification stream',
        'FacilityPanel.jsx': 'Industrial facility details and history',
        'MLPanel.jsx': 'ML prediction and model configuration UI',
        'Scene3D.jsx': 'Three.js powered 3D visualization',
        'TimeSlider.jsx': 'Temporal filtering of hotspots',
        'ClassFilter.jsx': 'Threat classification filtering',
        'Legend.jsx': 'Map symbology and layer legend',
        'ProfileBadge.jsx': 'User authentication and profile info'
    }
    
    for component, description in components_frontend.items():
        add_paragraph_with_bold(doc, f'{component}: ', description)
    
    add_heading_style(doc, 'Utilities & Services', 2)
    
    doc.add_paragraph('api.js: Centralized HTTP client for backend API communication with error handling')
    doc.add_paragraph('geoUtils.js: Geospatial utility functions (distance calculations, coordinate transforms)')
    doc.add_paragraph('useSeamlessVideo.js: Custom React hook for video background streaming')
    
    add_heading_style(doc, 'Styling & Theme', 2)
    
    doc.add_paragraph('index.css: Global stylesheet with responsive design')
    doc.add_paragraph('LoginPage.css, EnteringPage.css: Page-specific styling')
    doc.add_paragraph('Vite HMR: Hot module replacement for development')
    
    doc.add_page_break()
    
    # ============== 9. ML PIPELINE ==============
    add_heading_style(doc, '9. Machine Learning Pipeline', 1)
    
    add_heading_style(doc, 'Training Pipeline', 2)
    
    training_steps = [
        'Data Loading: unified CSV or Parquet format with strict schema validation',
        'Feature Schema Enforcement: 33-feature numerical vector with imputation for missing values',
        'Data Splitting: Stratified 80/20 train/test split respecting class distribution',
        'Cross-Validation: Stratified 5-fold CV for robust performance estimation',
        'Model Training: LightGBM and Random Forest classifier candidates',
        'Model Selection: Champion chosen on held-out macro F1 score',
        'Model Serialization: joblib export to models/ directory with metadata',
        'Verification: Live inference on realistic scenarios'
    ]
    
    for i, step in enumerate(training_steps, 1):
        doc.add_paragraph(step, style='List Number')
    
    add_heading_style(doc, 'Feature Engineering (33-Feature Contract)', 2)
    
    feature_groups = {
        'Thermal Features (3)': ['FRP (Fire Radiative Power)', 'Brightness Temperature (TI4)', 'Confidence score'],
        'Temporal Features (3)': ['Acquisition hour', 'Acquisition month', 'Night indicator (boolean)'],
        'Land Cover Features (5)': ['Cropland', 'Vegetation', 'Built-up area', 'Bare land', 'Water body'],
        'Distance Features (8)': ['Distance to nearest road', 'Distance to nearest building', 'Distance to settlement', 'Distance to industry', 'Distance to water', 'Distance to power line', 'Distance to POI', 'Distance to mine'],
        'Proximity & Density Features (11)': ['Building count (1km radius)', 'Industrial facility count', 'Settlement count', 'Water body proximity', 'POI count', 'Road density', 'Grid cell density', 'Fuel load indicator', 'Vulnerability index', 'Access index', 'Response capacity']
    }
    
    total_features = 0
    for group, features in feature_groups.items():
        add_heading_style(doc, group, 3)
        for feature in features:
            doc.add_paragraph(feature, style='List Bullet')
        total_features += len(features)
    
    doc.add_paragraph(f'Total: {total_features} features')
    
    add_heading_style(doc, 'Four-Class Threat Classification', 2)
    
    classes = {
        'Class 0': 'Controlled / low-risk thermal activity (routine operations, cold sources)',
        'Class 1': 'Agricultural / stubble burning (seasonal crop waste burning)',
        'Class 2': 'Wildfire / vegetation fuel fire (uncontrolled vegetation fire)',
        'Class 3': 'Critical industrial hazard fire (refinery accident, LNG incident, major facility fire)'
    }
    
    for class_name, description in classes.items():
        add_paragraph_with_bold(doc, f'{class_name}: ', description)
    
    add_heading_style(doc, 'Inference Pipeline', 2)
    
    doc.add_paragraph('Single-record prediction: predictor.py accepts unified hotspot row, applies feature transformation, and returns class + confidence')
    doc.add_paragraph('Batch prediction: dataset.py loads full dataset, vectorizes all rows, and returns class matrix')
    doc.add_paragraph('predict_cli.py: Command-line entry point for testing inference on benchmark data')
    
    doc.add_page_break()
    
    # ============== 10. INTEGRATION & APIs ==============
    add_heading_style(doc, '10. Integration & APIs', 1)
    
    add_heading_style(doc, 'Data Flow: FIRMS → Unified → Features → ML → Anomaly → Agents → Risk → DB → Dashboard', 2)
    
    doc.add_paragraph(
        'The system is designed as a modular pipeline where data flows through successive enrichment and analysis layers, each contributing context for downstream decisions.'
    )
    
    integration_points = {
        'FIRMS Ingestion': 'fetchFirms.js polls NASA FIRMS API, validates records, and posts to backend',
        'Enrichment Pipeline': 'firms_unified.py merges FIRMS with WorldCover + OSM context for each coordinate',
        'Feature Computation': 'engineer.py transforms enriched data into the 33-feature vector',
        'ML Prediction': 'predictor.py classifies each hotspot record into one of four threat classes',
        'Anomaly Scoring': 'detector.py compares current FRP against facility historical behavior (z-score)',
        'Multi-Agent Verification': 'pipeline.py runs Detector → Skeptic → Dispatcher sequence',
        'Risk Calculation': 'engine.py combines threat class, anomaly score, proximity, and exposure into 0-100 risk score',
        'Database Persistence': 'Backend writes hotspot, incident, and alert records to PostgreSQL/PostGIS',
        'API Exposure': 'Protected Express endpoints serve results to frontend dashboard',
        'Notification Dispatch': 'notify.js sends SMS/WhatsApp alerts via Twilio for high-priority incidents'
    }
    
    for integration, description in integration_points.items():
        add_paragraph_with_bold(doc, f'{integration}: ', description)
    
    doc.add_page_break()
    
    # ============== 11. TESTING & QA ==============
    add_heading_style(doc, '11. Testing & Quality Assurance', 1)
    
    add_heading_style(doc, 'Python Unit Tests', 2)
    
    tests = {
        'test_features.py': 'Feature engineering schema validation and transformer correctness',
        'test_ml_pipeline.py': 'Model training, cross-validation, and inference pipeline',
        'test_detector.py': 'Anomaly detection z-score calculations',
        'test_pipeline.py': 'Multi-agent orchestration and state transitions',
        'test_dataset_generator.py': 'Synthetic and real dataset loading'
    }
    
    for test_file, description in tests.items():
        add_paragraph_with_bold(doc, f'{test_file}: ', description)
    
    add_heading_style(doc, 'Test Execution', 2)
    
    doc.add_paragraph('Run all tests:', style='Normal')
    p = doc.add_paragraph('python -m pytest backend/app -q', style='List Bullet')
    p.paragraph_format.left_indent = Inches(0.5)
    
    doc.add_paragraph('Tests verify:')
    verifications = [
        'Feature schema correctness (no NaNs, correct dimensions)',
        'Model training convergence and cross-validation stability',
        'Anomaly score calculation accuracy',
        'Incident state machine logic',
        'Data loading and parsing robustness'
    ]
    for verification in verifications:
        doc.add_paragraph(verification, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 12. DEPLOYMENT & INFRASTRUCTURE ==============
    add_heading_style(doc, '12. Deployment & Infrastructure', 1)
    
    add_heading_style(doc, 'Docker Containerization', 2)
    
    doc.add_paragraph(
        'docker-compose.yml orchestrates multi-service deployment with PostgreSQL, Express backend, and optional Python services.'
    )
    
    services = {
        'PostgreSQL': 'Primary persistent data store with PostGIS extension',
        'Express Backend': 'Node.js API server on port 3000',
        'Frontend': 'React/Vite application served via HTTP',
        'Python Services': 'Optional ML pipeline and feature engineering services'
    }
    
    for service, role in services.items():
        add_paragraph_with_bold(doc, f'{service}: ', role)
    
    add_heading_style(doc, 'Configuration & Environment', 2)
    
    doc.add_paragraph(
        '.env file management for database credentials, API keys, and service endpoints'
    )
    
    add_heading_style(doc, 'Data Migrations', 2)
    
    migrations = {
        '001_osm_id_unique.sql': 'Ensure facility OSM ID uniqueness constraint',
        '002_auth.sql': 'User authentication schema and JWT token management',
        '003_anomaly_cols.sql': 'Add anomaly score and historical facility columns'
    }
    
    for migration, purpose in migrations.items():
        add_paragraph_with_bold(doc, f'{migration}: ', purpose)
    
    doc.add_page_break()
    
    # ============== 13. CURRENT ACCOMPLISHMENTS ==============
    add_heading_style(doc, '13. Current Accomplishments', 1)
    
    add_heading_style(doc, 'End-to-End System', 2)
    
    accomplishments_detailed = [
        'Complete data pipeline from NASA FIRMS → enriched hotspot → ML classification',
        'Multi-source geospatial enrichment with real-world OpenStreetMap and ESA WorldCover data',
        '33-dimensional feature space capturing thermal, temporal, land-cover, spatial, and density characteristics',
        'Production-grade LightGBM classifier with 4-class threat taxonomy',
        'Facility-level behavioral anomaly detection using z-score analysis',
        'Multi-agent verification system (Detector, Skeptic, Dispatcher) for staged verification',
        'Explainable risk scoring with transparent rule definitions and human-readable reasons',
        'Spatial database with PostGIS indexing for efficient geospatial queries',
        'Protected REST API with JWT authentication and role-based access',
        'Interactive React dashboard with Leaflet map, 3D visualization, and real-time alert feed',
        'Real-time scheduling system for periodic FIRMS data ingestion',
        'Multi-channel notification system (SMS/WhatsApp via Twilio)',
        'Comprehensive unit test coverage for all core modules'
    ]
    
    for acc in accomplishments_detailed:
        doc.add_paragraph(acc, style='List Bullet')
    
    add_heading_style(doc, 'Code Quality', 2)
    
    code_quality = [
        'Modular architecture with clear separation of concerns (ingestion, enrichment, ML, risk, API)',
        'Type-aware Python code with schema validation at every pipeline stage',
        'Consistent error handling and logging throughout backend',
        'Tested inference pipeline with reproducible results',
        'Documented API contract and feature schema'
    ]
    
    for item in code_quality:
        doc.add_paragraph(item, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 14. KEY FEATURES IMPLEMENTED ==============
    add_heading_style(doc, '14. Key Features Implemented', 1)
    
    features = {
        'Satellite Data Integration': [
            'NASA FIRMS API polling (fetchFirms.js)',
            'VIIRS observation normalization',
            'Confidence and FRP validation'
        ],
        'Geospatial Enrichment': [
            'WorldCover land-cover classification sampling',
            'OpenStreetMap feature extraction (roads, buildings, POI, settlements)',
            'Facility matching and linkage',
            'Distance calculations to roads, buildings, water, industry'
        ],
        'Machine Learning': [
            'Four-class threat classification',
            'LightGBM + Random Forest ensemble',
            'Stratified cross-validation',
            'Single-record and batch inference',
            'Model versioning and serialization'
        ],
        'Anomaly Detection': [
            'Facility historical baseline computation',
            'Z-score based abnormality flagging',
            'FRP deviation analysis'
        ],
        'Multi-Agent Verification': [
            'Detector agent (high recall)',
            'Skeptic agent (false-positive suppression)',
            'Dispatcher agent (priority assignment)'
        ],
        'Risk Assessment': [
            'Fire intensity scoring',
            'Industrial hazard proximity weighting',
            'Human vulnerability (buildings, settlements)',
            'Fuel and spread conditions',
            'Water body mitigation deduction',
            'Explainable reason generation'
        ],
        'Backend APIs': [
            'Authentication (JWT)',
            'Hotspot CRUD with spatial filters',
            'Facility management',
            'Incident retrieval and status tracking',
            'Alert feed consumption',
            'ML pipeline triggering and status monitoring',
            'Single-record prediction'
        ],
        'Frontend Dashboard': [
            'Interactive map with hotspot visualization',
            'Temporal filtering (DateTimeSlider)',
            'Threat classification filter',
            'Facility panel with history',
            'ML prediction interface',
            'Real-time alert feed',
            '3D visualization scene',
            'User authentication and profile'
        ],
        'Notifications': [
            'Twilio SMS integration',
            'Twilio WhatsApp integration',
            'Alert tier-based routing',
            'Operator notification history'
        ]
    }
    
    for feature_category, items in features.items():
        add_heading_style(doc, feature_category, 2)
        for item in items:
            doc.add_paragraph(item, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== 15. LIMITATIONS & FUTURE WORK ==============
    add_heading_style(doc, '15. Known Limitations & Future Work', 1)
    
    add_heading_style(doc, 'Current Limitations', 2)
    
    limitations = [
        'Parallel legacy and current ML paths exist; a unified taxonomy is needed for production',
        'Benchmark mode uses synthetic or rule-derived labels; production requires curated labels',
        'Dataset is limited to India region initially; global scaling requires retraining with regional data',
        'Ingestion scripts may require authentication hardening for production deployment',
        'Windows process configuration for scheduled tasks needs finalization',
        'Inference is spawned per-request; a persistent inference service is needed for scale',
        'No automated feedback loop from confirmed incidents to model retraining',
        'Rate limiting and query optimization for PostGIS may be needed under high load'
    ]
    
    for limitation in limitations:
        doc.add_paragraph(limitation, style='List Bullet')
    
    add_heading_style(doc, 'Recommended Future Work', 2)
    
    future_work = {
        'Scaling & Performance': [
            'Queue-based async processing (Celery, RQ, or native Node.js queues)',
            'Persistent inference service instead of spawning Python per request',
            'Partitioned spatial/temporal tables for large hotspot datasets',
            'Connection pooling optimization',
            'Caching layer (Redis) for frequently accessed hotspots'
        ],
        'Model & Data': [
            'Automated feedback loop from confirmed incidents to retraining',
            'Regional model variants (Asia, Africa, South America, etc.)',
            'Model versioning and A/B testing framework',
            'Active learning for selecting high-value training examples',
            'Uncertainty quantification in class predictions'
        ],
        'Operational Hardening': [
            'Unified taxonomy across all code paths',
            'Curated labeled dataset with domain expert annotations',
            'Environment-specific configuration management (dev, staging, production)',
            'Audit logging for all decisions and alerts',
            'Operator feedback collection UI',
            'Integration with external incident databases (e.g., fire agency records)'
        ],
        'Feature Expansion': [
            'Multi-temporal analysis (hotspot trends over weeks/months)',
            'Weather and atmospheric data integration',
            'Population density and exposure mapping',
            'Mobile app for field operator alerting',
            'Integration with emergency response systems',
            'Predictive fire spread modeling'
        ],
        'Explainability & Trust': [
            'SHAP value calculations for feature importance per prediction',
            'Confidence calibration analysis',
            'False-positive and false-negative case studies',
            'Operator feedback on alert quality',
            'Counterfactual explanations (\"what would change the decision?\")'
        ]
    }
    
    for category, items in future_work.items():
        add_heading_style(doc, category, 3)
        for item in items:
            doc.add_paragraph(item, style='List Bullet')
    
    doc.add_page_break()
    
    # ============== CONCLUSION ==============
    add_heading_style(doc, 'Conclusion', 1)
    
    doc.add_paragraph(
        'AgniDrishti represents a comprehensive, end-to-end geospatial intelligence system that transforms raw satellite thermal observations into actionable operational decisions. The system successfully combines multiple data sources, advanced ML classification, facility-level anomaly detection, multi-agent verification, and explainable risk assessment to deliver reliable alerts to operators.'
    )
    
    doc.add_paragraph()
    
    doc.add_paragraph(
        'The prototype has demonstrated the feasibility of the complete pipeline from ingestion to dashboard. While production deployment requires additional hardening (curated labels, unified taxonomy, persistent services, scaled infrastructure), the core architecture is sound and extensible. The modular design allows for independent evolution of components—improving the ML model, refining risk rules, or expanding geospatial context—without disrupting the overall system.'
    )
    
    doc.add_paragraph()
    
    doc.add_paragraph(
        'AgniDrishti turns an isolated satellite detection into an explainable operational decision: what happened, whether it is abnormal, how dangerous it is, and who should act.'
    )
    
    # ============== SAVE DOCUMENT ==============
    output_path = r'c:\Users\ASUS\Downloads\agnidrishti\Sih_agnidrishti\AgniDrishti_Project_Report.docx'
    doc.save(output_path)
    
    print(f'✓ Document generated successfully: {output_path}')
    return output_path

if __name__ == '__main__':
    create_project_document()
