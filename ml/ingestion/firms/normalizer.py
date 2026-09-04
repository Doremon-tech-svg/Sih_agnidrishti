from datetime import datetime


class FIRMSNormalizer:
    """
    Normalizes validated FIRMS hotspot records
    into a consistent internal format.
    """

    def normalize_record(self, record):
        """
        Convert one validated FIRMS record
        into a standardized hotspot record.
        """

        # Convert acquisition time
        raw_time = str(record["acq_time"]).zfill(4)

        acquisition_time = (
            f"{raw_time[:2]}:{raw_time[2:]}"
        )

        normalized = {
            "latitude": float(record["latitude"]),
            "longitude": float(record["longitude"]),

            "bright_ti4": float(record["bright_ti4"]),
            "bright_ti5": float(record["bright_ti5"]),

            "scan": float(record["scan"]),
            "track": float(record["track"]),

            "acquisition_date": datetime.strptime(
                record["acq_date"],
                "%Y-%m-%d"
            ).date(),

            "acquisition_time": acquisition_time,

            "satellite": record["satellite"],
            "instrument": record["instrument"],
            "confidence": record["confidence"],
            "version": record["version"],

            "frp": float(record["frp"]),

            "daynight": record["daynight"],

            "region": record["cluster"],

            "satellite_source": record[
                "satellite_source"
            ],
        }

        return normalized

    def normalize_records(self, records):
        """
        Normalize multiple validated FIRMS records.
        """

        return [
            self.normalize_record(record)
            for record in records
        ]