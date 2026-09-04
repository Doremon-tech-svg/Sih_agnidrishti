from pathlib import Path

from backend.app.ingestion.integration.firms_landcover import FIRMSLandCoverPipeline


PROJECT_ROOT = Path(__file__).resolve().parents[4]

FIRMS_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "firms"
)

LANDCOVER_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "landcover"
    / "gujarat"
)


def main():

    print("===================================")
    print("FIRMS + LANDCOVER FULL TEST")
    print("===================================")

    pipeline = FIRMSLandCoverPipeline(
        firms_directory=FIRMS_DIR,
        landcover_directory=LANDCOVER_DIR,
    )

    files = [
        "firms_jamnagar.csv",
        "firms_surat.csv",
        "firms_vadodara.csv",
    ]

    total_parsed = 0
    total_valid = 0
    total_invalid = 0
    total_enriched = 0
    total_without_landcover = 0

    try:

        for filename in files:

            print(f"\n--- {filename} ---")

            result = pipeline.process_file(filename)

            print(f"Parsed:    {result['parsed']}")
            print(f"Valid:     {result['valid']}")
            print(f"Invalid:   {result['invalid']}")
            print(f"Enriched:  {result['enriched']}")

            without_landcover = sum(
                1
                for record in result["records"]
                if record.get("landcover") is None
            )

            print(
                f"No LandCover: {without_landcover}"
            )

            total_parsed += result["parsed"]
            total_valid += result["valid"]
            total_invalid += result["invalid"]
            total_enriched += result["enriched"]
            total_without_landcover += without_landcover

        print("\n===================================")
        print("FULL PIPELINE SUMMARY")
        print("===================================")

        print(f"Total parsed:          {total_parsed}")
        print(f"Total valid:           {total_valid}")
        print(f"Total invalid:         {total_invalid}")
        print(f"Total enriched:        {total_enriched}")
        print(
            f"Without LandCover:     "
            f"{total_without_landcover}"
        )

        print("===================================")

        if total_invalid == 0:
            print("✓ FIRMS VALIDATION: PASSED")

        if total_without_landcover == 0:
            print("✓ LANDCOVER COVERAGE: PASSED")
        else:
            print(
                "⚠ Some hotspots have no matching "
                "LandCover tile."
            )

        if total_valid == total_enriched:
            print("✓ FIRMS + LANDCOVER: PASSED")

        print("===================================")

    finally:
        pipeline.close()


if __name__ == "__main__":
    main()