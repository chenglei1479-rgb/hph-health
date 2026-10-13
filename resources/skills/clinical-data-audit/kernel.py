"""Read-only CSV/XLSX inspection and synthetic cohort checks using Python stdlib only."""

_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
_MAX_XLSX_ENTRIES = 5000
_MAX_XLSX_UNCOMPRESSED = 200 * 1024 * 1024
_MAX_TABLE_COLUMNS = 16384
_MAX_TABLE_ROWS = 1000000
_MAX_TABLE_CELLS = 2000000
_MAX_TABULAR_BYTES = 100 * 1024 * 1024


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _column_index(reference):
    import re

    match = re.match(r"([A-Z]+)", reference or "", re.I)
    if not match:
        return None
    value = 0
    for character in match.group(1).upper():
        value = value * 26 + ord(character) - 64
    return value - 1


def _parse_number(value):
    import math

    number = float(value)
    if not math.isfinite(number):
        return value
    if number.is_integer() and abs(number) < 2**53:
        return int(number)
    return number


def _xlsx_tables(path):
    import posixpath
    import zipfile
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(path, "r") as archive:
        entries = archive.infolist()
        if len(entries) > _MAX_XLSX_ENTRIES:
            raise ValueError("XLSX package contains too many ZIP entries for a safe audit.")
        if sum(entry.file_size for entry in entries) > _MAX_XLSX_UNCOMPRESSED:
            raise ValueError("XLSX expands beyond the 200 MiB audit limit.")
        names = set(archive.namelist())
        if "xl/workbook.xml" not in names or "xl/_rels/workbook.xml.rels" not in names:
            raise ValueError("File is not a supported XLSX workbook.")

        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root:
                if _local(item.tag) == "si":
                    shared.append("".join(node.text or "" for node in item.iter() if _local(node.tag) == "t"))

        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {}
        for relationship in relationships:
            if _local(relationship.tag) != "Relationship":
                continue
            if relationship.attrib.get("TargetMode") == "External":
                continue
            target = relationship.attrib.get("Target", "")
            resolved = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join("xl", target))
            if resolved.startswith("xl/") and not resolved.startswith("xl/../"):
                targets[relationship.attrib.get("Id", "")] = resolved

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        tables = []
        for element in workbook.iter():
            if _local(element.tag) != "sheet":
                continue
            title = element.attrib.get("name", "")
            state = element.attrib.get("state", "visible")
            target = targets.get(element.attrib.get("{" + _REL_NS + "}id", ""))
            if not target or target not in names:
                tables.append({"name": title, "state": state, "headers": [], "rows": [], "error": "Worksheet XML is missing or unsupported."})
                continue
            sheet_root = ET.fromstring(archive.read(target))
            rows_by_number = {}
            max_column = -1
            retained_cells = 0
            for row_position, row_element in enumerate((node for node in sheet_root.iter() if _local(node.tag) == "row"), start=1):
                try:
                    row_number = int(row_element.attrib.get("r", row_position))
                except ValueError:
                    row_number = row_position
                if row_number < 1 or row_number > _MAX_TABLE_ROWS:
                    raise ValueError("Worksheet row index exceeds the supported audit limit.")
                if row_number in rows_by_number:
                    raise ValueError("Worksheet contains duplicate row indices.")
                values = {}
                for cell in row_element:
                    if _local(cell.tag) != "c":
                        continue
                    index = _column_index(cell.attrib.get("r"))
                    if index is None:
                        continue
                    if index >= _MAX_TABLE_COLUMNS:
                        raise ValueError("Worksheet column index exceeds the XLSX column limit.")
                    max_column = max(max_column, index)
                    kind = cell.attrib.get("t", "n")
                    value_element = next((node for node in cell if _local(node.tag) == "v"), None)
                    formula_element = next((node for node in cell if _local(node.tag) == "f"), None)
                    inline = next((node for node in cell if _local(node.tag) == "is"), None)
                    raw = value_element.text if value_element is not None else None
                    if kind == "s" and raw is not None:
                        shared_index = int(raw)
                        if shared_index < 0 or shared_index >= len(shared):
                            raise ValueError("Worksheet references a missing shared string.")
                        value = shared[shared_index]
                    elif kind == "inlineStr" and inline is not None:
                        value = "".join(node.text or "" for node in inline.iter() if _local(node.tag) == "t")
                    elif kind == "b":
                        value = raw == "1"
                    elif kind == "e":
                        value = {"excel_error": raw or ""}
                    elif raw is not None and kind in ("n", ""):
                        try:
                            value = _parse_number(raw)
                        except (ValueError, OverflowError):
                            value = raw
                    elif raw is not None:
                        value = raw
                    elif formula_element is not None:
                        value = {"formula_without_cached_value": formula_element.text or ""}
                    else:
                        value = None
                    values[index] = value
                if values:
                    retained_cells += max(values) + 1
                    if retained_cells > _MAX_TABLE_CELLS:
                        raise ValueError("Worksheet exceeds the 2 million cell audit limit.")
                    dense = [None] * (max(values) + 1)
                    for index, value in values.items():
                        dense[index] = value
                    rows_by_number[row_number] = dense

            width = max_column + 1
            if width * len(rows_by_number) > _MAX_TABLE_CELLS:
                raise ValueError("Worksheet exceeds the 2 million cell audit limit.")
            rows = []
            for row_number in sorted(rows_by_number):
                dense = rows_by_number[row_number]
                if len(dense) < width:
                    dense.extend([None] * (width - len(dense)))
                rows.append({"source_row": row_number, "values": dense})
            header_position = next((index for index, row in enumerate(rows) if any(not _is_missing(value) for value in row["values"])), None)
            headers = []
            data_rows = rows
            header_source_row = None
            if header_position is not None:
                header_row = rows[header_position]
                header_source_row = header_row["source_row"]
                headers = header_row["values"][:]
                data_rows = rows[header_position + 1:]
            tables.append({
                "name": title,
                "state": state,
                "headers": headers,
                "rows": data_rows,
                "header_source_row": header_source_row,
                "source_nonempty_rows": len(rows),
                "column_count": width,
            })
        return tables


def _is_missing(value):
    return value is None or (isinstance(value, str) and not value.strip())


def _csv_tables(path):
    import csv
    import os

    if os.path.getsize(path) > _MAX_TABULAR_BYTES:
        raise ValueError("Delimited input exceeds the 100 MiB audit limit.")

    error = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            with open(path, "r", encoding=encoding, newline="") as stream:
                sample = stream.read(8192)
                stream.seek(0)
                if str(path).lower().endswith(".tsv"):
                    dialect = csv.excel_tab
                else:
                    try:
                        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
                    except csv.Error:
                        dialect = csv.excel
                reader = csv.reader(stream, dialect)
                raw_rows = []
                width = 0
                while True:
                    source_row = reader.line_num + 1
                    try:
                        row = next(reader)
                    except StopIteration:
                        break
                    width = max(width, len(row))
                    if width > _MAX_TABLE_COLUMNS or len(raw_rows) >= _MAX_TABLE_ROWS:
                        raise ValueError("Delimited input exceeds the supported row or column audit limit.")
                    if width * (len(raw_rows) + 1) > _MAX_TABLE_CELLS:
                        raise ValueError("Delimited input exceeds the 2 million cell audit limit.")
                    raw_rows.append({"source_row": source_row, "values": row})
            break
        except UnicodeDecodeError as exc:
            error = exc
    else:
        raise ValueError("CSV encoding is not UTF-8 or CP932.") from error

    header_position = next((index for index, row in enumerate(raw_rows) if any(str(value).strip() for value in row["values"])), None)
    if header_position is None:
        return [{"name": "CSV", "state": "visible", "headers": [], "rows": [], "source_nonempty_rows": 0, "column_count": 0}]
    header_row = raw_rows[header_position]
    header = header_row["values"]
    width = max([len(header)] + [len(row["values"]) for row in raw_rows[header_position + 1:]])
    header = header + [None] * (width - len(header))
    rows = []
    for row in raw_rows[header_position + 1:]:
        padded = row["values"] + [None] * (width - len(row["values"]))
        if any(not _is_missing(value) for value in padded):
            rows.append({"source_row": row["source_row"], "values": padded})
    return [{
        "name": "CSV",
        "state": "visible",
        "headers": header,
        "rows": rows,
        "header_source_row": header_row["source_row"],
        "source_nonempty_rows": len(rows) + 1,
        "column_count": width,
    }]


def _load_tables(path):
    suffix = str(path).lower().rsplit(".", 1)[-1] if "." in str(path) else ""
    if suffix == "xlsx":
        return _xlsx_tables(path)
    if suffix in ("csv", "tsv"):
        return _csv_tables(path)
    raise ValueError("Supported inputs are .xlsx, .csv, and .tsv files.")


def _nonempty_rows(table):
    return [row for row in table.get("rows", []) if any(not _is_missing(value) for value in row["values"])]


def _column_map(headers):
    import re

    result = {}
    for index, value in enumerate(headers):
        key = re.sub(r"[^a-z0-9]+", "", str(value or "").strip().casefold())
        if key and key not in result:
            result[key] = index
    return result


def _as_number(value):
    import math

    if isinstance(value, bool) or isinstance(value, dict) or _is_missing(value):
        return None
    try:
        number = float(str(value).replace(",", ""))
        return number if math.isfinite(number) else None
    except (ValueError, TypeError, OverflowError):
        return None


def _median(values):
    if not values:
        return None
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2


def _display_type(values):
    present = [value for value in values if not _is_missing(value)]
    if not present:
        return "empty"
    kinds = set()
    for value in present:
        if isinstance(value, bool):
            kinds.add("boolean")
        elif isinstance(value, dict):
            kinds.add("formula/error")
        elif _as_number(value) is not None:
            kinds.add("numeric")
        else:
            kinds.add("text")
    return next(iter(kinds)) if len(kinds) == 1 else "mixed"


def inspect_dataset(path, sheet_name=None):
    """Return worksheet structure and headers without modifying the source or printing row values."""
    tables = _load_tables(path)
    visible = [table for table in tables if table.get("state") == "visible" and not table.get("error")]
    selected = None
    if sheet_name is not None:
        selected = next((table for table in visible if table["name"] == sheet_name), None)
        if selected is None:
            raise ValueError("Requested sheet was not found among visible, readable worksheets.")
    elif visible:
        selected = visible[0]
    worksheets = []
    for table in tables:
        rows = _nonempty_rows(table)
        worksheets.append({
            "name": table.get("name"),
            "visibility": table.get("state"),
            "readable": not bool(table.get("error")),
            "error": table.get("error"),
            "headers": ["" if value is None else str(value) for value in table.get("headers", [])],
            "data_rows": len(rows),
            "columns": table.get("column_count", len(table.get("headers", []))),
        })
    return {
        "source": str(path),
        "format": str(path).lower().rsplit(".", 1)[-1],
        "worksheets": worksheets,
        "selected_sheet": selected.get("name") if selected else None,
        "read_only": True,
        "source_modified": False,
    }


def audit_synthetic_cohort(
    path,
    sheet_name=None,
    id_column=None,
    data_origin_column="data_origin",
    neutrophils_column="neutrophils",
    lymphocytes_column="lymphocytes",
    nlr_column="baseline_nlr_ratio",
    event_column=None,
    event_time_column=None,
    followup_time_column=None,
    iqr_multiplier=1.5,
):
    """Compute a read-only screening report. Event/time checks need explicit researcher mappings."""
    import math
    import re

    tables = _load_tables(path)
    visible = [table for table in tables if table.get("state") == "visible" and not table.get("error")]
    table = next((item for item in visible if item.get("name") == sheet_name), None) if sheet_name else (visible[0] if visible else None)
    if table is None:
        raise ValueError("No readable visible worksheet was selected.")
    headers = table.get("headers", [])
    rows = _nonempty_rows(table)
    width = max(len(headers), max((len(row["values"]) for row in rows), default=0))
    headers = list(headers) + [None] * (width - len(headers))
    colmap = _column_map(headers)

    def resolve(name):
        return colmap.get(re.sub(r"[^a-z0-9]+", "", str(name or "").strip().casefold()))

    columns = []
    for index, header in enumerate(headers):
        values = [row["values"][index] if index < len(row["values"]) else None for row in rows]
        numbers = [_as_number(value) for value in values]
        numeric = [value for value in numbers if value is not None]
        columns.append({
            "name": "" if header is None else str(header),
            "type": _display_type(values),
            "unit": "not specified in file metadata",
            "missing_count": sum(_is_missing(value) for value in values),
            "missing_percent": round(100 * sum(_is_missing(value) for value in values) / len(rows), 2) if rows else 0.0,
            "value_min": min(numeric) if numeric else None,
            "value_max": max(numeric) if numeric else None,
            "numeric_count": len(numeric),
        })

    id_index = resolve(id_column) if id_column else next((resolve(name) for name in ("patient_id", "subject_id", "record_id", "case_id", "study_id", "id") if resolve(name) is not None), None)
    duplicates = []
    if id_index is not None:
        seen = {}
        for row in rows:
            values = row["values"]
            value = values[id_index] if id_index < len(values) else None
            if _is_missing(value):
                continue
            key = str(value).strip()
            if key in seen:
                duplicates.append({"id": key, "source_rows": [seen[key], row["source_row"]]})
            else:
                seen[key] = row["source_row"]

    origin_index = resolve(data_origin_column)
    origin_values = [row["values"][origin_index] if origin_index is not None and origin_index < len(row["values"]) else None for row in rows]
    origin_check = {"status": "unverified", "column": data_origin_column, "rows_marked_synthetic": 0, "row_count": len(rows)}
    if origin_index is not None:
        marked = sum(str(value).strip().upper() == "SYNTHETIC" for value in origin_values if not _is_missing(value))
        missing = sum(_is_missing(value) for value in origin_values)
        origin_check.update({
            "rows_marked_synthetic": marked,
            "missing_or_blank": missing,
            "status": "pass" if marked == len(rows) and missing == 0 else "review",
        })

    n_index, l_index, ratio_index = resolve(neutrophils_column), resolve(lymphocytes_column), resolve(nlr_column)
    nlr = {"status": "unverified", "columns": [neutrophils_column, lymphocytes_column, nlr_column], "compared_rows": 0, "mismatch_rows": [], "invalid_rows": []}
    if n_index is not None and l_index is not None and ratio_index is not None:
        mismatches, invalid, compared = [], [], 0
        for row in rows:
            values = row["values"]
            n = _as_number(values[n_index] if n_index < len(values) else None)
            lymph = _as_number(values[l_index] if l_index < len(values) else None)
            ratio = _as_number(values[ratio_index] if ratio_index < len(values) else None)
            if n is None or lymph is None or ratio is None or lymph <= 0:
                invalid.append(row["source_row"])
                continue
            compared += 1
            expected = n / lymph
            if not math.isclose(expected, ratio, rel_tol=1e-3, abs_tol=1e-3):
                mismatches.append({"source_row": row["source_row"], "expected_ratio": round(expected, 6), "observed_ratio": ratio})
        nlr.update({"status": "pass" if compared and not mismatches and not invalid else "review", "compared_rows": compared, "mismatch_rows": mismatches[:100], "mismatch_count": len(mismatches), "invalid_rows": invalid[:100], "invalid_count": len(invalid), "tolerance": "relative 0.1% or absolute 0.001"})

    event_status = "unverified"
    event_result = {"status": event_status, "reason": "Event/time meanings were not supplied; no event semantics were inferred."}
    if event_column and (event_time_column or followup_time_column):
        event_index = resolve(event_column)
        event_time_index = resolve(event_time_column) if event_time_column else None
        followup_index = resolve(followup_time_column) if followup_time_column else None
        if event_index is not None:
            inconsistent = []
            for row in rows:
                values = row["values"]
                event_value = values[event_index] if event_index < len(values) else None
                event_text = str(event_value).strip().casefold()
                is_event = event_text in ("1", "true", "yes", "event", "occurred", "death")
                time_index = event_time_index if is_event and event_time_index is not None else followup_index
                if time_index is None:
                    continue
                time_value = values[time_index] if time_index < len(values) else None
                numeric_time = _as_number(time_value)
                if _is_missing(time_value) or (numeric_time is not None and numeric_time < 0):
                    inconsistent.append(row["source_row"])
            event_result = {"status": "review" if inconsistent else "pass", "event_column": event_column, "event_time_column": event_time_column, "followup_time_column": followup_time_column, "inconsistent_source_rows": inconsistent[:100], "inconsistent_count": len(inconsistent), "note": "Event coding was interpreted using common 1/true/yes/event/occurred/death values; confirm this matches the data dictionary."}

    outliers = []
    for index, column in enumerate(columns):
        header_key = re.sub(r"[^a-z0-9]+", "", column["name"].casefold())
        if index == id_index or header_key.endswith("id"):
            continue
        numeric_rows = []
        for row in rows:
            values = row["values"]
            number = _as_number(values[index] if index < len(values) else None)
            if number is not None:
                numeric_rows.append((number, row["source_row"]))
        if len(numeric_rows) < 4:
            continue
        sorted_values = sorted(value for value, _ in numeric_rows)
        midpoint = len(sorted_values) // 2
        lower_half = sorted_values[:midpoint]
        upper_half = sorted_values[(midpoint + 1 if len(sorted_values) % 2 else midpoint):]
        if not lower_half or not upper_half:
            continue
        q1 = _median(lower_half)
        q3 = _median(upper_half)
        spread = q3 - q1
        low, high = q1 - iqr_multiplier * spread, q3 + iqr_multiplier * spread
        candidates = [{"source_row": source_row, "value": value} for value, source_row in numeric_rows if value < low or value > high]
        if candidates:
            outliers.append({"column": column["name"], "rule": "1.5×IQR screening candidate only", "candidate_count": len(candidates), "candidates": candidates[:50]})

    missing_total = sum(column["missing_count"] for column in columns)
    cell_total = len(rows) * width
    return {
        "source": str(path),
        "source_modified": False,
        "sheet": table.get("name"),
        "rows": len(rows),
        "columns": width,
        "header_source_row": table.get("header_source_row"),
        "duplicate_identifier_check": {"status": "unverified" if id_index is None else ("pass" if not duplicates else "review"), "column": headers[id_index] if id_index is not None else None, "duplicate_count": len(duplicates), "duplicates": duplicates[:100]},
        "missingness": {"missing_cells": missing_total, "total_cells": cell_total, "percent": round(100 * missing_total / cell_total, 2) if cell_total else 0.0, "columns": columns},
        "data_origin_check": origin_check,
        "nlr_check": nlr,
        "event_time_check": event_result,
        "outlier_candidates": outliers,
        "unresolved": [
            "Units are not inferred from numeric values; provide a data dictionary for unit validation.",
            "Event/time consistency remains unverified unless event and time column meanings are explicitly supplied.",
            "IQR flags are review candidates, not errors or grounds for excluding observations.",
        ],
        "actions_taken": {"imputation": False, "row_deletion": False, "value_correction": False, "inferential_tests": False},
    }
