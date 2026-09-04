from pathlib import Path

from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.osm.spatial_query import OSMSpatialQuery


class FIRMSOSMPipeline:
    """
    Integrates FIRMS hotspot data with OpenStreetMap
    road information.
    """

    def __init__(
        self,
        firms_directory,
        osm_geojson,
        radius_meters=1000
    ):
        self.firms_directory = Path(firms_directory)
        self.radius_meters = radius_meters

        self.validator = FIRMSValidator()
        self.normalizer = FIRMSNormalizer()

        self.osm = OSMSpatialQuery(
            osm_geojson
        )

    def process_file(self, filename):
        """
        Process one FIRMS CSV and enrich every valid
        hotspot with nearby OSM road information.
        """

        file_path = self.firms_directory / filename

        parser = FIRMSParser(file_path)

        # -----------------------------
        # 1. Parse
        # -----------------------------
        records = parser.parse()

        # -----------------------------
        # 2. Validate
        # -----------------------------
        valid_records, invalid_records = (
            self.validator.validate_records(records)
        )

        # -----------------------------
        # 3. Normalize
        # -----------------------------
        normalized_records = (
            self.normalizer.normalize_records(
                valid_records
            )
        )

        enriched_records = []
        osm_failures = 0

        # -----------------------------
        # 4. OSM enrichment
        # -----------------------------
        for record in normalized_records:

            try:

                osm_data = self.osm.nearby_roads(
                    latitude=record["latitude"],
                    longitude=record["longitude"],
                    radius_meters=self.radius_meters
                )

                enriched_record = {
                    **record,
                    "osm": osm_data,
                }

                enriched_records.append(
                    enriched_record
                )

            except Exception as error:

                osm_failures += 1

                enriched_records.append(
                    {
                        **record,
                        "osm": None,
                        "osm_error": str(error),
                    }
                )

        return {
            "filename": filename,
            "parsed": len(records),
            "valid": len(valid_records),
            "invalid": len(invalid_records),
            "enriched": len(enriched_records),
            "osm_failures": osm_failures,
            "records": enriched_records,
            "invalid_records": invalid_records,
        }

    def close(self):
        """
        Release OSM resources.
        """

        self.osm = None