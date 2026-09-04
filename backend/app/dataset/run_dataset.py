"""
CLI runner for AgniDrishti Unified Dataset Generation.
Usage:
    python -m backend.app.dataset.run_dataset --city jamnagar
    python -m backend.app.dataset.run_dataset --city surat --limit 50
    python -m backend.app.dataset.run_dataset --all --limit 100
"""

import argparse
from pathlib import Path

from backend.app.dataset.cities import CITIES
from backend.app.dataset.generator import UnifiedDatasetGenerator


def main():
    parser = argparse.ArgumentParser(
        description="AgniDrishti Multi-City Unified Dataset Batch Generator"
    )
    parser.add_argument(
        "--city",
        type=str,
        default=None,
        help=f"Target city key. Choices: {list(CITIES.keys())}",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all configured cities and create a consolidated Gujarat dataset",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on hotspots per city for fast execution",
    )

    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[3]
    generator = UnifiedDatasetGenerator(base_dir=project_root)

    try:
        if args.all or not args.city:
            print("Running batch generation across ALL cities...")
            result = generator.process_all_cities(limit_per_city=args.limit)
            print("\n==========================================")
            print("ALL CITIES BATCH COMPLETED")
            print(f"Total Records: {result['total_consolidated_records']}")
            print("Cities summary:", result["cities_processed"])
            print("==========================================")
        else:
            city_key = args.city.lower()
            res = generator.process_city(city_key, limit=args.limit)
            print("\n==========================================")
            print(f"CITY '{city_key.upper()}' BATCH COMPLETED")
            print(f"Total Records: {res['total_records']}")
            print("==========================================")
    finally:
        generator.close()


if __name__ == "__main__":
    main()
