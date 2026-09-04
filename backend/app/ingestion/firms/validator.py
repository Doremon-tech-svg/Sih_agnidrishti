from datetime import datetime


class FIRMSValidator:
    """
    Validates parsed NASA FIRMS hotspot records.
    """

    REQUIRED_FIELDS = {
        "latitude",
        "longitude",
        "acq_date",
        "acq_time",
        "frp",
        "satellite",
        "satellite_source",
    }

    VALID_SATELLITE_SOURCES = {
        "VIIRS_NOAA20_NRT",
        "VIIRS_NOAA21_NRT",
        "VIIRS_SNPP_NRT",
    }

    NUMERIC_FIELDS = {
        "latitude",
        "longitude",
        "bright_ti4",
        "bright_ti5",
        "scan",
        "track",
        "frp",
    }

    def validate_record(self, record):
        """
        Validate one FIRMS record.

        Returns:
            (True, []) if valid
            (False, [error messages]) if invalid
        """

        errors = []

        # ---------------------------------
        # 1. Required fields
        # ---------------------------------
        for field in self.REQUIRED_FIELDS:
            value = record.get(field)

            if value is None or str(value).strip() == "":
                errors.append(f"Missing required field: {field}")

        # Stop here if required fields are missing
        if errors:
            return False, errors

        # ---------------------------------
        # 2. Numeric fields
        # ---------------------------------
        numeric_values = {}

        for field in self.NUMERIC_FIELDS:
            value = record.get(field)

            if value is None or str(value).strip() == "":
                continue

            try:
                numeric_values[field] = float(value)
            except (ValueError, TypeError):
                errors.append(
                    f"{field} must be numeric: {value}"
                )

        # ---------------------------------
        # 3. Latitude validation
        # ---------------------------------
        if "latitude" in numeric_values:
            latitude = numeric_values["latitude"]

            if not -90 <= latitude <= 90:
                errors.append(
                    f"Latitude out of range: {latitude}"
                )

        # ---------------------------------
        # 4. Longitude validation
        # ---------------------------------
        if "longitude" in numeric_values:
            longitude = numeric_values["longitude"]

            if not -180 <= longitude <= 180:
                errors.append(
                    f"Longitude out of range: {longitude}"
                )

        # ---------------------------------
        # 5. FRP validation
        # ---------------------------------
        if "frp" in numeric_values:
            frp = numeric_values["frp"]

            if frp < 0:
                errors.append(
                    f"FRP cannot be negative: {frp}"
                )

        # ---------------------------------
        # 6. Date validation
        # ---------------------------------
        try:
            datetime.strptime(
                str(record["acq_date"]),
                "%Y-%m-%d"
            )
        except ValueError:
            errors.append(
                f"Invalid acquisition date: "
                f"{record['acq_date']}"
            )

        # ---------------------------------
        # 7. Acquisition time validation
        # ---------------------------------
        acq_time = str(record["acq_time"]).strip()

        if not acq_time.isdigit():
            errors.append(
                f"Invalid acquisition time: {acq_time}"
            )
        elif not 0 <= int(acq_time) <= 2359:
            errors.append(
                f"Acquisition time out of range: {acq_time}"
            )

        # ---------------------------------
        # 8. Satellite source validation
        # ---------------------------------
        satellite_source = record.get(
            "satellite_source"
        )

        if satellite_source not in self.VALID_SATELLITE_SOURCES:
            errors.append(
                f"Unknown satellite source: "
                f"{satellite_source}"
            )

        # ---------------------------------
        # Final result
        # ---------------------------------
        return len(errors) == 0, errors

    def validate_records(self, records):
        """
        Validate multiple FIRMS records.

        Returns:
            valid_records
            invalid_records
        """

        valid_records = []
        invalid_records = []

        for index, record in enumerate(records):

            is_valid, errors = self.validate_record(record)

            if is_valid:
                valid_records.append(record)
            else:
                invalid_records.append(
                    {
                        "row": index + 2,
                        "record": record,
                        "errors": errors,
                    }
                )

        return valid_records, invalid_records