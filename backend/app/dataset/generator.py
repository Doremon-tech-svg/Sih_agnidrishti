"""
Unified Dataset Generator for AgniDrishti.
Batch processes multi-city fire hotspots combining FIRMS, LandCover, OSM, 33-Features, and Explainable Risk.
Exports consolidated golden records in Parquet, CSV, and GeoJSON formats.
"""

from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import pandas as pd

from backend.app.dataset.cities import CITIES, get_city_config
from backend.app.features.engineer import FireFeatureEngineer
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.landcover.extractor import LandCoverExtractor
from backend.app.ingestion.osm.context_query import OSMContextQuery
from backend.app.risk.engine import RiskEngine


class UnifiedDatasetGenerator:
    """
    End-to-end multi-city batch generator producing golden unified fire datasets.
    """

    def __init__(
        self,
        base_dir: Optional[Path] = None,
        output_dir: Optional[Path] = None,
        radius_meters: float = 1000.0,
        radius_degrees: float = 0.05,
    ):
        self.base_dir = (
            Path(base_dir) if base_dir else Path(__file__).resolve().parents[3]
        )
        self.firms_dir = self.base_dir / "data" / "raw" / "firms"
        self.landcover_dir = self.base_dir / "data" / "raw" / "landcover" / "gujarat"
        self.osm_pbf_file = (
            self.base_dir / "data" / "raw" / "osm" / "western-zone-260830.osm.pbf"
        )
        self.processed_osm_dir = self.base_dir / "data" / "processed" / "osm"

        self.output_dir = (
            Path(output_dir)
            if output_dir
            else self.base_dir / "data" / "processed" / "unified"
        )
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.radius_meters = radius_meters
        self.radius_degrees = radius_degrees

        # Reusable engines
        self.validator = FIRMSValidator()
        self.normalizer = FIRMSNormalizer()
        self.feature_engineer = FireFeatureEngineer()
        self.risk_engine = RiskEngine()

        # Cache extractors
        self.landcover_extractor = (
            LandCoverExtractor(self.landcover_dir)
            if self.landcover_dir.exists()
            else None
        )
        self._osm_queries: Dict[str, OSMContextQuery] = {}

    def _get_osm_query(self, road_geojson_name: Optional[str]) -> Optional[OSMContextQuery]:
        """Lazy load and cache OSM context queries per road geojson file."""
        if not self.osm_pbf_file.exists():
            return None

        # Determine road file path
        road_file = None
        if road_geojson_name:
            candidate = self.processed_osm_dir / road_geojson_name
            if candidate.exists():
                road_file = candidate

        # Fallback to Jamnagar roads if city road file not yet generated
        if road_file is None:
            fallback = self.processed_osm_dir / "roads_jamnagar.geojson"
            if fallback.exists():
                road_file = fallback

        if road_file is None:
            return None

        cache_key = str(road_file)
        if cache_key not in self._osm_queries:
            try:
                self._osm_queries[cache_key] = OSMContextQuery(
                    osm_file=self.osm_pbf_file,
                    road_geojson=road_file,
                )
            except Exception as e:
                print(f"[WARN] Could not initialize OSMContextQuery for {road_file}: {e}")
                return None

        return self._osm_queries[cache_key]

    def process_city(
        self,
        city_key: str,
        limit: Optional[int] = None,
        verbose: bool = True,
    ) -> Dict[str, Any]:
        """
        Process a city or cluster by key, returning the unified dataset.
        """
        config = get_city_config(city_key)
        if not config:
            raise ValueError(
                f"Unknown city '{city_key}'. Available: {list(CITIES.keys())}"
            )

        firms_file = self.firms_dir / config["firms_file"]
        if not firms_file.exists():
            raise FileNotFoundError(f"FIRMS dataset not found: {firms_file}")

        if verbose:
            print(f"\n==========================================")
            print(f"Processing: {config['display_name']} ({config['firms_file']})")
            print(f"==========================================")

        # 1. Ingest FIRMS
        parser = FIRMSParser(firms_file)
        raw_records = parser.parse()
        valid_records, _ = self.validator.validate_records(raw_records)
        normalized_records = self.normalizer.normalize_records(valid_records)

        if limit and limit > 0:
            normalized_records = normalized_records[:limit]

        total_records = len(normalized_records)
        if verbose:
            print(f"Total Hotspots to process: {total_records}")

        # OSM Context handler
        osm_query = self._get_osm_query(config.get("road_geojson"))

        golden_records: List[Dict[str, Any]] = []

        for idx, record in enumerate(normalized_records):
            lat = record["latitude"]
            lon = record["longitude"]

            # LandCover
            landcover = None
            if self.landcover_extractor:
                try:
                    landcover = self.landcover_extractor.extract_landcover(lat, lon)
                except Exception:
                    landcover = None

            # OSM Context
            osm_ctx = None
            if osm_query:
                try:
                    osm_ctx = osm_query.query(
                        latitude=lat,
                        longitude=lon,
                        radius_meters=self.radius_meters,
                        radius_degrees=self.radius_degrees,
                    )
                except Exception:
                    osm_ctx = None

            # Enriched record dict
            enriched = {
                **record,
                "landcover": landcover,
                "osm": osm_ctx,
            }

            # 33-Feature Vector
            features = self.feature_engineer.transform_record(enriched)

            # Risk Engine Evaluation
            risk = self.risk_engine.evaluate(features)

            # Assemble Golden Unified Record
            event_id = f"FIRE_{city_key.upper()[:3]}_{idx + 1:04d}"
            
            # Format dates/times safely
            acq_d = record.get("acquisition_date")
            acq_d_str = (
                acq_d.strftime("%Y-%m-%d")
                if isinstance(acq_d, (date, datetime))
                else str(acq_d)
            )

            golden_record = {
                # Identification
                "event_id": event_id,
                "city": city_key,
                "display_city": config["display_name"],
                "latitude": lat,
                "longitude": lon,
                "acquisition_date": acq_d_str,
                "acquisition_time": str(record.get("acquisition_time", "00:00")),
                "is_night": features["is_night"],
                
                # Satellite Metrics
                "frp": features["frp"],
                "brightness": features["brightness"],
                "confidence_score": features["confidence_score"],
                "satellite": str(record.get("satellite", "")),
                "instrument": str(record.get("instrument", "")),
                "scan": features["scan"],
                "track": features["track"],
                
                # Environmental (LandCover)
                "landcover_code": features["landcover_code"],
                "landcover_name": landcover.get("class_name", "Unknown") if landcover else "Unknown",
                "is_cropland": features["is_cropland"],
                "is_vegetation": features["is_vegetation"],
                "is_built_up": features["is_built_up"],
                "is_water": features["is_water"],
                "is_bare_land": features["is_bare_land"],
                
                # OSM Infrastructure & Spatial Distances
                "nearest_road_distance_m": features["nearest_road_distance_m"],
                "nearby_road_count": features["nearby_road_count"],
                "is_road_adjacent": features["is_road_adjacent"],
                "nearest_building_distance_m": features["nearest_building_distance_m"],
                "building_count": features["building_count"],
                "has_nearby_buildings": features["has_nearby_buildings"],
                "nearest_settlement_distance_m": features["nearest_settlement_distance_m"],
                "settlement_count": features["settlement_count"],
                "is_near_settlement": features["is_near_settlement"],
                "nearest_industrial_distance_m": features["nearest_industrial_distance_m"],
                "industrial_count": features["industrial_count"],
                "is_near_industrial": features["is_near_industrial"],
                "nearest_water_distance_m": features["nearest_water_distance_m"],
                "water_body_count": features["water_body_count"],
                "has_nearby_water": features["has_nearby_water"],
                "poi_count": features["poi_count"],
                "landuse_count": features["landuse_count"],
                
                # Explainable Risk Intelligence
                "risk_score": risk["risk_score"],
                "risk_level": risk["risk_level"],
                "fire_intensity_score": risk["breakdown"].get("fire_intensity", 0.0),
                "industrial_hazard_score": risk["breakdown"].get("industrial_hazard", 0.0),
                "human_vulnerability_score": risk["breakdown"].get("human_vulnerability", 0.0),
                "fuel_spread_score": risk["breakdown"].get("fuel_and_spread", 0.0),
                "mitigation_deduction": risk["breakdown"].get("mitigation_deduction", 0.0),
                "risk_reasons": "; ".join(risk.get("reasons", [])),
            }

            golden_records.append(golden_record)

            if verbose and (idx + 1) % 25 == 0 or (idx + 1) == total_records:
                print(f"[{idx + 1}/{total_records}] Hotspots processed...")

        # Export dataset
        export_paths = self._export(golden_records, prefix=city_key, verbose=verbose)

        return {
            "city": city_key,
            "total_records": len(golden_records),
            "export_paths": export_paths,
            "records": golden_records,
        }

    def _export(
        self,
        records: List[Dict[str, Any]],
        prefix: str,
        verbose: bool = True,
    ) -> Dict[str, str]:
        """Export golden records to CSV, GeoJSON, and Parquet."""
        df = pd.DataFrame(records)
        paths = {}

        # 1. Export CSV
        csv_path = self.output_dir / f"{prefix}_unified.csv"
        df.to_csv(csv_path, index=False)
        paths["csv"] = str(csv_path)

        # 2. Export GeoJSON
        geojson_features = []
        for r in records:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [r["longitude"], r["latitude"]],
                },
                "properties": {k: v for k, v in r.items() if k not in ("latitude", "longitude")},
            }
            geojson_features.append(feature)

        geojson_data = {
            "type": "FeatureCollection",
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "count": len(records),
                "prefix": prefix,
            },
            "features": geojson_features,
        }

        geojson_path = self.output_dir / f"{prefix}_unified.geojson"
        with open(geojson_path, "w", encoding="utf-8") as f:
            json.dump(geojson_data, f, indent=2)
        paths["geojson"] = str(geojson_path)

        # 3. Export Parquet (if pyarrow / fastparquet available)
        parquet_path = self.output_dir / f"{prefix}_unified.parquet"
        try:
            df.to_parquet(parquet_path, index=False)
            paths["parquet"] = str(parquet_path)
        except Exception as e:
            if verbose:
                print(f"[INFO] Parquet engine skipped: {e}")

        if verbose:
            print(f"✓ Successfully exported {len(records)} records for '{prefix}':")
            for fmt, p in paths.items():
                print(f"  • {fmt.upper()}: {p}")

        return paths

    def process_all_cities(
        self,
        cities: Optional[List[str]] = None,
        limit_per_city: Optional[int] = None,
        verbose: bool = True,
    ) -> Dict[str, Any]:
        """
        Process multiple cities and create both city-specific and consolidated state datasets.
        """
        target_cities = cities or list(CITIES.keys())
        all_records: List[Dict[str, Any]] = []
        city_summaries = {}

        for city in target_cities:
            try:
                res = self.process_city(city, limit=limit_per_city, verbose=verbose)
                city_summaries[city] = res["total_records"]
                all_records.extend(res["records"])
            except Exception as e:
                print(f"[ERROR] Failed to process city '{city}': {e}")

        # Consolidated exports
        consolidated_paths = {}
        if all_records:
            consolidated_paths = self._export(
                all_records, prefix="gujarat_consolidated", verbose=verbose
            )

        return {
            "cities_processed": city_summaries,
            "total_consolidated_records": len(all_records),
            "consolidated_paths": consolidated_paths,
        }

    def close(self):
        """Release underlying open raster and OSM resources."""
        if self.landcover_extractor:
            try:
                self.landcover_extractor.close()
            except Exception:
                pass
        for q in self._osm_queries.values():
            try:
                q.close()
            except Exception:
                pass
        self._osm_queries.clear()
