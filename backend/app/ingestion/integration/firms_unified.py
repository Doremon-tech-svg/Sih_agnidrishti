from pathlib import Path

from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.landcover.extractor import LandCoverExtractor
from backend.app.ingestion.osm.context_query import OSMContextQuery


class FIRMSUnifiedPipeline:
    """
    Unified enrichment pipeline combining:

    FIRMS + LandCover + OpenStreetMap
    """

    def __init__(
        self,
        firms_directory,
        landcover_directory,
        osm_file,
        osm_geojson,
        radius_meters=1000,
        radius_degrees=0.05,
    ):
        self.firms_directory = Path(firms_directory)

        self.validator = FIRMSValidator()
        self.normalizer = FIRMSNormalizer()

        self.landcover = LandCoverExtractor(
            landcover_directory
        )

        self.osm = OSMContextQuery(
            osm_file=osm_file,
            road_geojson=osm_geojson,
        )

        self.radius_meters = radius_meters
        self.radius_degrees = radius_degrees

    def process_file(self, filename):
        """
        Parse, validate, normalize and enrich
        FIRMS hotspots with LandCover + OSM context.
        """

        file_path = self.firms_directory / filename

        # 1. Parse
        parser = FIRMSParser(file_path)
        records = parser.parse()

        # 2. Validate
        valid_records, invalid_records = (
            self.validator.validate_records(records)
        )

        # 3. Normalize
        normalized_records = (
            self.normalizer.normalize_records(
                valid_records
            )
        )

        enriched_records = []

        landcover_failures = 0
        osm_failures = 0

        # 4. Enrich every hotspot
        for record in normalized_records:

            enriched_record = {
                **record,
                "landcover": None,
                "osm": None,
            }

            # LandCover enrichment
            try:
                landcover = (
                    self.landcover.extract_landcover(
                        latitude=record["latitude"],
                        longitude=record["longitude"],
                    )
                )

                enriched_record["landcover"] = landcover

            except Exception as error:
                landcover_failures += 1

                enriched_record["landcover_error"] = str(
                    error
                )

            # OSM enrichment
            try:
                osm_context = self.osm.query(
                    latitude=record["latitude"],
                    longitude=record["longitude"],
                    radius_meters=self.radius_meters,
                    radius_degrees=self.radius_degrees,
                )

                enriched_record["osm"] = osm_context

            except Exception as error:
                osm_failures += 1

                enriched_record["osm_error"] = str(
                    error
                )

            enriched_records.append(
                enriched_record
            )

        return {
            "filename": filename,
            "parsed": len(records),
            "valid": len(valid_records),
            "invalid": len(invalid_records),
            "enriched": len(enriched_records),
            "landcover_failures": landcover_failures,
            "osm_failures": osm_failures,
            "records": enriched_records,
            "invalid_records": invalid_records,
        }
    def process_record(self, record):
        """
        Enrich a single normalized FIRMS record
        with LandCover and OSM context.
        """

        enriched_record = {
            **record,
            "landcover": None,
            "osm": None,
        }

        # -----------------------------
        # LandCover enrichment
        # -----------------------------
        try:
            enriched_record["landcover"] = (
                self.landcover.extract_landcover(
                    latitude=record["latitude"],
                    longitude=record["longitude"],
                )
            )

        except Exception as error:
            enriched_record["landcover_error"] = str(error)

        # -----------------------------
        # OSM enrichment
        # -----------------------------
        try:
            enriched_record["osm"] = self.osm.query(
                latitude=record["latitude"],
                longitude=record["longitude"],
                radius_meters=self.radius_meters,
                radius_degrees=self.radius_degrees,
            )

        except Exception as error:
            enriched_record["osm_error"] = str(error)

        return enriched_record

    def close(self):
        """
        Release pipeline resources.
        """

        self.landcover.close()
        self.osm.close()