from pathlib import Path

from parser import FIRMSParser


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
    print("FIRMS PARSER TEST")
    print("===================================")

    total_records = 0

    for filename in FILES:

        file_path = FIRMS_DIR / filename

        print(f"\n--- {filename} ---")

        parser = FIRMSParser(file_path)

        records = parser.parse()

        print(f"Records: {len(records)}")

        if records:
            print("First record:")
            print(records[0])

        total_records += len(records)

    print("\n===================================")
    print(f"Total records: {total_records}")
    print("✓ FIRMS PARSER TEST PASSED")
    print("===================================")


if __name__ == "__main__":
    main()