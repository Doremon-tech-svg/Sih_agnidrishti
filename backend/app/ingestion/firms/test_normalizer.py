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


def main():

    print("===================================")
    print("FIRMS NORMALIZER TEST")
    print("===================================")

    parser = FIRMSParser(
        FIRMS_DIR / FILES[0]
    )

    validator = FIRMSValidator()
    normalizer = FIRMSNormalizer()

    # Parse
    records = parser.parse()

    # Validate
    valid_records, invalid_records = (
        validator.validate_records(records)
    )

    # Normalize
    normalized_records = (
        normalizer.normalize_records(
            valid_records
        )
    )

    print(f"Raw records       : {len(records)}")
    print(f"Valid records     : {len(valid_records)}")
    print(f"Invalid records   : {len(invalid_records)}")
    print(f"Normalized records: {len(normalized_records)}")

    if normalized_records:

        print("\nFirst normalized record:")

        for key, value in normalized_records[0].items():
            print(f"{key}: {value} ({type(value).__name__})")

    # Basic checks
    assert isinstance(
        normalized_records[0]["latitude"],
        float
    )

    assert isinstance(
        normalized_records[0]["longitude"],
        float
    )

    assert isinstance(
        normalized_records[0]["frp"],
        float
    )

    assert isinstance(
        normalized_records[0]["acquisition_date"],
        object
    )

    print("\n===================================")
    print("✓ FIRMS NORMALIZER TEST PASSED")
    print("===================================")


if __name__ == "__main__":
    main()