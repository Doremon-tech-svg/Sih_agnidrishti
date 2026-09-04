from pathlib import Path

from parser import FIRMSParser
from validator import FIRMSValidator


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
    print("FIRMS VALIDATOR TEST")
    print("===================================")

    validator = FIRMSValidator()

    total_valid = 0
    total_invalid = 0

    for filename in FILES:

        print(f"\n--- {filename} ---")

        file_path = FIRMS_DIR / filename

        parser = FIRMSParser(file_path)

        records = parser.parse()

        valid_records, invalid_records = (
            validator.validate_records(records)
        )

        print(f"Total records : {len(records)}")
        print(f"Valid records : {len(valid_records)}")
        print(f"Invalid records: {len(invalid_records)}")

        total_valid += len(valid_records)
        total_invalid += len(invalid_records)

        # Show first invalid record if one exists
        if invalid_records:

            print("\nFirst invalid record:")

            print(
                invalid_records[0]
            )

    print("\n===================================")
    print(f"Total valid   : {total_valid}")
    print(f"Total invalid : {total_invalid}")
    print("===================================")

    if total_invalid == 0:
        print("✓ FIRMS VALIDATOR TEST PASSED")
    else:
        print(
            "⚠ Validator completed with invalid records"
        )


if __name__ == "__main__":
    main()