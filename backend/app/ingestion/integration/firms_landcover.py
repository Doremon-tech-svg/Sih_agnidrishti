from pathlib import Path

from backend.app.ingestion.firms.parser import FIRMSParser
from backend.app.ingestion.firms.validator import FIRMSValidator
from backend.app.ingestion.firms.normalizer import FIRMSNormalizer
from backend.app.ingestion.landcover.extractor import LandCoverExtractor


class FIRMSLandCoverPipeline:
    """
    Integrates FIRMS hotspot data with ESA WorldCover
    land-cover information.
    """

    def __init__(self, firms_directory, landcover_directory):

        self.firms_directory = Path(firms_directory)
        self.landcover_directory = Path(landcover_directory)

        self.validator = FIRMSValidator()
        self.normalizer = FIRMSNormalizer()

        self.landcover = LandCoverExtractor(
            self.landcover_directory
        )

    def process_file(self, filename):
        """
        Process one FIRMS CSV and enrich every valid
        hotspot with land-cover information.
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

        # -----------------------------
        # 4. LandCover enrichment
        # -----------------------------
        for record in normalized_records:

            try:

                landcover = (
                    self.landcover.extract_landcover(
                        latitude=record["latitude"],
                        longitude=record["longitude"]
                    )
                )

                enriched_record = {
                    **record,
                    "landcover": landcover,
                }

                enriched_records.append(
                    enriched_record
                )

            except ValueError as error:

                enriched_records.append(
                    {
                        **record,
                        "landcover": None,
                        "landcover_error": str(error),
                    }
                )

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
        """
        Close the LandCover extractor.
        """

        self.landcover.close()