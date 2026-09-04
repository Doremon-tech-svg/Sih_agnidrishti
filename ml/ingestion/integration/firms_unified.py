from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

from ml.ingestion.firms.parser import FIRMSParser
from ml.ingestion.firms.validator import FIRMSValidator
from ml.ingestion.firms.normalizer import FIRMSNormalizer
from ml.ingestion.landcover.extractor import LandCoverExtractor
from ml.ingestion.osm.context_query import OSMContextQuery
from ml.ingestion.nightfire.parser import NightfireParser
from ml.ingestion.nightfire.normalizer import NightfireNormalizer
from ml.ingestion.powerplants.parser import PowerPlantParser
from ml.ingestion.worldpop.extractor import WorldPopExtractor
from ml.ingestion.spatial import NearestNeighbors


class FIRMSUnifiedPipeline:
    """
    Unified enrichment pipeline combining:
    FIRMS + LandCover + OSM + Nightfire + PowerPlants + WorldPop
    """

    def __init__(
        self,
        firms_directory,
        landcover_directory=None,
        osm_file=None,
        osm_geojson=None,
        nightfire_file=None,
        powerplants_file=None,
        worldpop_file=None,
        radius_meters=1000,
        radius_degrees=0.05,
    ):
        self.firms_directory = Path(firms_directory)
        self.validator = FIRMSValidator()
        self.normalizer = FIRMSNormalizer()

        # Optional components
        self.landcover = None
        self.osm = None
        self.nightfire_df = None
        self.powerplants_df = None
        self.worldpop = None
        self.nightfire_tree = None
        self.powerplants_tree = None

        if landcover_directory and Path(landcover_directory).exists():
            self.landcover = LandCoverExtractor(landcover_directory)

        if osm_geojson and Path(osm_geojson).exists():
            buildings_geojson = Path(osm_geojson).parent / "buildings_gujarat.geojson"
            landuse_geojson = Path(osm_geojson).parent / "landuse_gujarat.geojson"
            self.osm = OSMContextQuery(
                roads_geojson=osm_geojson,
                buildings_geojson=buildings_geojson if buildings_geojson.exists() else None,
                landuse_geojson=landuse_geojson if landuse_geojson.exists() else None,
            )

        if nightfire_file and Path(nightfire_file).exists():
            parser = NightfireParser(nightfire_file)
            raw_nf = parser.parse()
            normalizer = NightfireNormalizer()
            self.nightfire_df = normalizer.normalize(raw_nf)
            if not self.nightfire_df.empty:
                self.nightfire_tree = NearestNeighbors(self.nightfire_df[["latitude", "longitude"]])

        if powerplants_file and Path(powerplants_file).exists():
            parser = PowerPlantParser(powerplants_file)
            self.powerplants_df = parser.parse()
            if not self.powerplants_df.empty:
                self.powerplants_tree = NearestNeighbors(self.powerplants_df[["latitude", "longitude"]])

        if worldpop_file and Path(worldpop_file).exists():
            self.worldpop = WorldPopExtractor(worldpop_file)

        self.radius_meters = radius_meters
        self.radius_degrees = radius_degrees

    def _enrich_nightfire(self, lat, lon):
        if self.nightfire_tree is None or self.nightfire_df is None:
            return None
        dist_m, idx = self.nightfire_tree.nearest(lat, lon)
        # idx is numpy array if k>1, but k=1 returns scalar
        row = self.nightfire_df.iloc[idx]
        return {
            "nearest_distance_m": float(dist_m),
            "detection_frequency": float(row.get("detection_freq_2024", 0.0)),
            "type": row.get("type", ""),
            "avg_temp_k": row.get("avg_temp_k", None),
        }

    def _enrich_powerplants(self, lat, lon):
        if self.powerplants_tree is None or self.powerplants_df is None:
            return None
        # Nearest power plant
        dist_m, idx = self.powerplants_tree.nearest(lat, lon)
        nearest_row = self.powerplants_df.iloc[idx]

        # Count plants within 5 km (or radius_meters)
        radius = 5000.0  # fixed threshold for "nearby"
        # Convert chord distance threshold from meters
        chord = 2 * np.sin(radius / (2 * 6371000.0))
        # Get all indices within chord distance of the nearest point (approx)
        # Better: query all points within chord of the query point
        lat_r = np.radians(lat)
        lon_r = np.radians(lon)
        x = np.cos(lat_r) * np.cos(lon_r)
        y = np.cos(lat_r) * np.sin(lon_r)
        z = np.sin(lat_r)
        query_pt = np.array([x, y, z])
        indices = self.powerplants_tree.kdtree.query_ball_point(query_pt, chord)
        count = len(indices)

        return {
            "nearest_distance_m": float(dist_m),
            "capacity_mw": float(nearest_row.get("capacity_mw", 0.0)),
            "count": int(count),
        }

    def _enrich_worldpop(self, lat, lon):
        if self.worldpop is None:
            return None
        density = self.worldpop.get_population(lat, lon)
        return {"density": density}

    def process_record(self, record):
        """
        Enrich a single normalized FIRMS record with all available data.
        """
        enriched_record = {
            **record,
            "landcover": None,
            "osm": None,
            "nightfire": None,
            "powerplants": None,
            "worldpop": None,
        }

        lat = record["latitude"]
        lon = record["longitude"]

        # LandCover
        if self.landcover:
            try:
                enriched_record["landcover"] = self.landcover.extract_landcover(lat, lon)
            except Exception as e:
                enriched_record["landcover_error"] = str(e)

        # OSM
        if self.osm:
            try:
                enriched_record["osm"] = self.osm.query(
                    latitude=lat,
                    longitude=lon,
                    radius_meters=self.radius_meters,
                    radius_degrees=self.radius_degrees,
                )
            except Exception as e:
                enriched_record["osm_error"] = str(e)

        # Nightfire
        if self.nightfire_tree is not None:
            enriched_record["nightfire"] = self._enrich_nightfire(lat, lon)

        # Power Plants
        if self.powerplants_tree is not None:
            enriched_record["powerplants"] = self._enrich_powerplants(lat, lon)

        # WorldPop
        if self.worldpop:
            enriched_record["worldpop"] = self._enrich_worldpop(lat, lon)

        return enriched_record

    def process_file(self, filename):
        """
        Process an entire FIRMS CSV and enrich all valid hotspots.
        """
        file_path = self.firms_directory / filename
        parser = FIRMSParser(file_path)
        records = parser.parse()
        valid_records, invalid_records = self.validator.validate_records(records)
        normalized_records = self.normalizer.normalize_records(valid_records)

        enriched_records = []
        for record in normalized_records:
            enriched = self.process_record(record)
            enriched_records.append(enriched)

        return {
            "filename": filename,
            "parsed": len(records),
            "valid": len(valid_records),
            "invalid": len(invalid_records),
            "enriched": len(enriched_records),
            "records": enriched_records,
            "invalid_records": invalid_records,
        }

    def close(self):
        if self.landcover:
            self.landcover.close()
        if self.osm:
            self.osm.close()
        if self.worldpop:
            self.worldpop.close()