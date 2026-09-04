from pathlib import Path

from parser import FIRMSParser
from validator import FIRMSValidator
from normalizer import FIRMSNormalizer


PROJECT_ROOT = Path(__file__).resolve().parents[4]

FIRMS_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "firms"
)


FILES = [
    "firms_jamnagar.csv",
    "firms_surat.csv",
    "firms_vadodara.csv",
]


def process_file(file_path, parser, validator, normalizer):
    """
    Process one FIRMS CSV through the complete pipeline.
    """

    print(f"\nProcessing: {file_path.name}")

    # -----------------------------
    # Step 1: Parse
    # -----------------------------
    records = parser.parse()

    print(f"  Parsed: {len(records)}")

    # -----------------------------
    # Step 2: Validate
    # -----------------------------
    valid_records, invalid_records = (
        validator.validate_records(records)
    )

    print(f"  Valid: {len(valid_records)}")
    print(f"  Invalid: {len(invalid_records)}")

    # -----------------------------
    # Step 3: Normalize
    # -----------------------------
    normalized_records = (
        normalizer.normalize_records(
            valid_records
        )
    )

    print(
        f"  Normalized: "
        f"{len(normalized_records)}"
    )

    return (
        normalized_records,
        invalid_records
    )


def main():

    print("===================================")
    print("FIRMS COMPLETE INGESTION PIPELINE")
    print("===================================")

    parser = None
    validator = FIRMSValidator()
    normalizer = FIRMSNormalizer()

    all_normalized_records = []
    all_invalid_records = []

    for filename in FILES:

        file_path = FIRMS_DIR / filename

        # Create parser for current file
        parser = FIRMSParser(file_path)

        normalized_records, invalid_records = (
            process_file(
                file_path,
                parser,
                validator,
                normalizer
            )
        )

        all_normalized_records.extend(
            normalized_records
        )

        all_invalid_records.extend(
            invalid_records
        )

    # -----------------------------
    # Final summary
    # -----------------------------

    print("\n===================================")
    print("PIPELINE SUMMARY")
    print("===================================")

    print(
        f"Total normalized records: "
        f"{len(all_normalized_records)}"
    )

    print(
        f"Total invalid records: "
        f"{len(all_invalid_records)}"
    )

    # -----------------------------
    # Verify output
    # -----------------------------

    if all_normalized_records:

        first = all_normalized_records[0]

        print("\nSample normalized hotspot:")
        print("-----------------------------------")

        for key, value in first.items():
            print(f"{key}: {value}")

    # -----------------------------
    # Assertions
    # -----------------------------

    assert len(all_normalized_records) > 0

    assert len(all_normalized_records) == (
        len(all_normalized_records)
    )

    # Every normalized record must
    # contain the essential fields.

    required_output_fields = {
        "latitude",
        "longitude",
        "acquisition_date",
        "acquisition_time",
        "frp",
        "satellite",
        "satellite_source",
        "region",
    }

    for record in all_normalized_records:

        assert required_output_fields.issubset(
            record.keys()
        )

        assert isinstance(
            record["latitude"],
            float
        )

        assert isinstance(
            record["longitude"],
            float
        )

        assert isinstance(
            record["frp"],
            float
        )

    print("\n===================================")
    print("✓ COMPLETE FIRMS PIPELINE PASSED")
    print("===================================")


if __name__ == "__main__":
    main()