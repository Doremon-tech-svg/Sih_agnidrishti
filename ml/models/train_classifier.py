""""
Train an XGBoost/LightGBM classifier on enriched FIRMS data with weak labels.
Saves model artifacts for later inference.
"""

import sys
import json
import warnings
from pathlib import Path

# Add project root to sys.path first
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
import lightgbm as lgb

from ml.models.weak_labeler import label_dataframe, CLASS_NAMES
from ml.config import OUTPUT_DIR, MODEL_DIR

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "frp", "frp_zscore", "brightness", "confidence_score",
    "scan", "track", "acquisition_hour", "acquisition_month", "is_night",
    "landcover_code", "is_cropland", "is_vegetation", "is_built_up",
    "is_water", "is_bare_land",
    "nearest_road_distance_m", "nearby_road_count", "is_road_adjacent",
    "building_count", "nearest_building_distance_m", "has_nearby_buildings",
    "settlement_count", "nearest_settlement_distance_m", "is_near_settlement",
    "industrial_count", "nearest_industrial_distance_m", "is_near_industrial",
    "water_body_count", "nearest_water_distance_m", "has_nearby_water",
    "poi_count", "landuse_count",
    "nearest_nightfire_distance_m", "nightfire_detection_freq", "is_nightfire_match",
    "nearest_powerplant_distance_m", "powerplant_capacity_mw", "powerplant_count",
    "population_density", "cluster_density",
]


def load_enriched_data(path):
    df = pd.read_parquet(path)
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0
    return df


def main():
    enriched_path = OUTPUT_DIR / "enriched_gujarat.parquet"
    if not enriched_path.exists():
        print("Run run_enrichment.py first to generate enriched data.")
        return

    print("Loading enriched data...")
    df = load_enriched_data(enriched_path)
    print(f"Rows: {len(df)}")

    print("Applying weak supervision labels...")
    df = label_dataframe(df)
    print(df["label_name"].value_counts())

    # Prepare X
    X = df[FEATURE_COLS].values.astype(np.float32)

    # Encode labels to contiguous 0..K-1
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(df["label"].values.astype(int))
    classes = label_encoder.classes_.tolist()   # original class numbers
    n_classes = len(classes)

    print(f"Training with {n_classes} classes: {classes}")
    # Original class names for each label index (for later mapping)
    label_map = {i: CLASS_NAMES[orig] for i, orig in enumerate(classes)}

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Train: {len(X_train)}, Test: {len(X_test)}")

    # XGBoost
    print("Training XGBoost...")
    xgb_model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=n_classes,
        n_estimators=300,
        max_depth=8,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )
    xgb_model.fit(X_train, y_train)

    xgb_pred = xgb_model.predict(X_test)
    xgb_acc = accuracy_score(y_test, xgb_pred)
    print(f"XGBoost Accuracy: {xgb_acc:.4f}")
    print(classification_report(y_test, xgb_pred, target_names=list(label_map.values())))

    # LightGBM
    print("Training LightGBM...")
    lgb_model = lgb.LGBMClassifier(
        objective="multiclass",
        num_class=n_classes,
        n_estimators=300,
        max_depth=8,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbosity=-1,
    )
    lgb_model.fit(X_train, y_train)

    lgb_pred = lgb_model.predict(X_test)
    lgb_acc = accuracy_score(y_test, lgb_pred)
    print(f"LightGBM Accuracy: {lgb_acc:.4f}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    xgb_path = MODEL_DIR / "xgb_classifier.joblib"
    lgb_path = MODEL_DIR / "lgb_classifier.joblib"
    meta_path = MODEL_DIR / "classifier_meta.json"

    joblib.dump(xgb_model, xgb_path)
    joblib.dump(lgb_model, lgb_path)

    meta = {
        "feature_cols": FEATURE_COLS,
        "class_names": {str(i): label_map[i] for i in range(n_classes)},
        "label_encoder": label_encoder.classes_.tolist(),
        "xgb_accuracy": round(xgb_acc, 4),
        "lgb_accuracy": round(lgb_acc, 4),
        "n_train": len(X_train),
        "n_test": len(X_test),
    }
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Saved models to {MODEL_DIR}")


if __name__ == "__main__":
    main()