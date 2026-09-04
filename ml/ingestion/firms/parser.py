import csv
from pathlib import Path


class FIRMSParser:
    """
    Parser for locally downloaded NASA FIRMS CSV files.
    """

    REQUIRED_COLUMNS = {
        "latitude",
        "longitude",
        "bright_ti4",
        "scan",
        "track",
        "acq_date",
        "acq_time",
        "satellite",
        "instrument",
        "confidence",
        "version",
        "bright_ti5",
        "frp",
        "daynight",
        "cluster",
        "satellite_source",
    }

    def __init__(self, csv_path):
        self.csv_path = Path(csv_path)

    def parse(self):
        """
        Read the FIRMS CSV and return records as dictionaries.
        """

        if not self.csv_path.exists():
            raise FileNotFoundError(
                f"FIRMS file not found: {self.csv_path}"
            )

        records = []

        with self.csv_path.open(
            mode="r",
            encoding="utf-8",
            newline=""
        ) as file:

            reader = csv.DictReader(file)

            if reader.fieldnames is None:
                raise ValueError("CSV file has no header.")

            columns = set(reader.fieldnames)

            missing = self.REQUIRED_COLUMNS - columns

            if missing:
                raise ValueError(
                    f"Missing required columns: {sorted(missing)}"
                )

            for row in reader:
                records.append(row)

        return records

    def count(self):
        """
        Return the number of records in the CSV.
        """

        return len(self.parse())