---
name: clinical-data-audit
description: Read-only structural and quality audit for researcher-provided CSV, TSV, and XLSX cohorts. Use before statistical analysis to report schema, missingness, duplicate identifiers, provenance markers, event/time consistency when definitions are supplied, NLR consistency, and outlier candidates. Uses Python standard library only; never installs packages or changes source data.
---

# Clinical data audit

Use this workflow when a researcher asks to inspect a cohort or audit dataset quality. The helper accepts CSV, TSV, and XLSX files using only Python's standard library, so an unavailable `openpyxl` or pandas package is not a reason to stop or install dependencies.

## Procedure

1. Confirm the current attached/input file and its version. Do not substitute a prior attachment. Check direct identifiers are absent before exposing any row-level content. Treat synthetic provenance as unverified until the file itself contains an appropriate marker.
2. Call `inspect_dataset(path)` first. Report worksheets, headers, row and column counts. For XLSX, the helper opens the ZIP/XML package read-only and never writes to the source.
3. Agree on the cohort sheet and clinical meanings before interpreting event/time fields, units, censoring, or variable labels. If definitions are absent, mark those checks unverified rather than guessing.
4. Call `audit_synthetic_cohort(path, sheet_name=..., id_column=..., event_column=..., event_time_column=..., followup_time_column=...)` with only mappings that are explicit in the data dictionary or confirmed by the researcher. NLR field names default to `neutrophils`, `lymphocytes`, and `baseline_nlr_ratio`; pass alternatives only when confirmed.
5. Report measured findings separately from unresolved definitions. Duplicate, missingness, NLR mismatch, and outlier rows should use source row numbers; never impute, delete, overwrite, or run inferential statistical tests during this audit.
6. Do not invent a quality score from unverified checks. If a score is requested, show the scoring rubric, verified coverage, and unresolved items; label it as a data-quality screening score, not clinical validity or a DRA benchmark.

## Helper use

The helpers are loaded by the Notebook skill runtime. Call `inspect_dataset(...)` and `audit_synthetic_cohort(...)` directly in Python cells; do not import `openpyxl`, pandas, or helper files. Keep the original input unchanged and save any requested report as a separate artifact.

The reader supports UTF-8 (including BOM) and Japanese CP932 delimited files; `.tsv` always uses tabs. Reports refer to the physical starting line of each CSV record, including records with quoted newlines. XLSX formulas use cached values; formulas are never evaluated, and number-format dates are not converted from Excel serial numbers. Confirm date and time representations before interpreting them.

Inspection stops on damaged workbook references or limits rather than silently dropping values: at most 1 million rows, 16,384 columns, and 2 million logical cells per table, 100 MiB for delimited inputs, and 5,000 ZIP entries / 200 MiB expanded for XLSX. Report the exact blocker and incomplete coverage if a limit is reached; request a researcher-prepared subset or a suitable analysis workflow without claiming the full file was audited.
