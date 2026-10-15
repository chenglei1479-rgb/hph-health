---
name: research-deliverables
description: Prepare a fixed mentor discussion pack, data audit and statistical consultation pack, or conference abstract/English draft from supplied and verified research evidence. Confirm inputs, checklist and human review; never infer executed statistics or approval.
license: Apache-2.0
category: research
---

# Research deliverables

Use the user's selected language. The package mode is recorded in the project context. If absent, clarify the requested package. These are research drafts for review; do not promise mentor acceptance, journal acceptance, expert consultation, or publication.

Before work, present the required inputs and fixed output checklist below. Ask for missing inputs together. Use only authorized data and available capabilities. Do not upload patient identifiers, make external submissions, or silently broaden the study. Keep synthetic provenance visibly SYNTHETIC. Researcher confirmation of the design/statistical plan and execution must remain explicit; a plan file is not approval.

## mentor-pack: mentor discussion pack

Required: research question/population/outcome, intended study design, available data or evidence, and the mentor's decision to be supported. If the question is unsettled, prepare options as a provisional brief. Literature retrieval needs an agreed search scope; report sources not searched.

Fixed outputs:

1. `01_mentor_brief.md`: approximately one page with the question, rationale, feasibility, tentative novelty and limitations.
2. `02_evidence.csv`: source title/year/PMID/DOI when verified, link, study population/design, relevant finding and verification status. Supplied but unverified evidence stays labeled unverified; never manufacture a minimum number of studies.
3. `03_study_options.md`: feasible design options, inputs, endpoint definitions, major biases and unresolved decisions.
4. `04_mentor_questions.md`: prioritized questions and decisions requiring mentor/researcher review.

Ready for review only when all four outputs exist or a missing component is explicitly listed as blocked. No statistical execution is required. Tentative novelty is not a proven absence of prior work.

## consultation-pack: data audit and statistical consultation pack

Required: authorized anonymized CSV/TSV/XLSX, selected sheet, data dictionary (units/coding), cohort/endpoint definitions, and question for consultation. If there is no dataset, prepare only the input checklist and plan skeleton, labeled not audited.

Use clinical-data-audit for standard-library read-only inspection when available. Confirm variable meanings before interpreting event/time consistency. Do not alter source data, impute, or silently select cutoffs. Follow biomedical-discovery analysis readiness and recovery rules; inspect required packages and record permission/quota unknown states. Statistical execution follows explicit approval and actual verified runtime results.

Fixed outputs:

1. `01_data_audit.md`: exact input identity/version/checksum when available, sheet, rows/columns, schema, missingness, duplicates, outlier candidates and definition-dependent checks. Distinguish measured from unverified checks.
2. `02_statistical_plan.md`: design, estimand, outcomes/exposures, exclusions, missingness, effect measures, assumptions, diagnostics and sensitivity analyses; state approval status.
3. `03_consultation_questions.md`: unresolved definitions, biases and questions for the statistician. AI preparation does not mean a statistician has reviewed it.
4. `04_analysis_status.md`: per proposed analysis: not run/blocked/computed/needs review, blocker or Run ID, code/output paths and environment evidence. Draft code is optional and clearly unexecuted; calculated results are included only after verified approved execution.

An audit/consultation pack can be ready for review with an unexecuted statistical plan. Do not label the study or analysis complete. A computed status requires a successful terminal Run and accessible numeric output; preserve failed or uncertain Runs and input versions.

### Beta export

The statistician review package that leaves DRA is aggregate only, in files that open without DRA:

1. Statistical report: `.docx` or `.pdf`.
2. Result tables: `.xlsx` with the real counts and no masking under 10. The audience is the internal research team.
3. Runnable analysis script: `.R` or `.py`.
4. Variable definition table: `.pdf`.
5. Execution log: `.pdf`.

Do not export raw data, Notebook outputs that contain individual rows, or chat history. Do not offer those choices. Before any file is written, scan for hardcoded chart numbers (カルテ番号), birth dates, and individual patient values in the script and the report. A doctor must confirm the de-identified package. If confirmation is dismissed, export nothing.

## writing-pack: conference abstract or English draft

Required: choose conference abstract or English manuscript sections; supplied verified study design/methods/results, target venue and length/structure if known. Ask once which format is wanted. Target requirements must be supplied or checked against available official instructions; otherwise use general format and label venue requirements unverified. English is the target draft language; explain review notes in the user's language.

Fixed outputs:

1. `01_abstract_or_english_draft.md`: labeled draft with supplied facts only. Abstract sections follow the target requirements; manuscript draft is limited to agreed sections.
2. `02_claim_source_map.csv`: each material claim/number mapped to supplied source, table/output or verified citation, with verification status.
3. `03_author_review.md`: missing facts, meaning/causal-strength changes, target requirements, word count and author decisions. Preserve numbers, uncertainty and synthetic labels.

If real results are missing, produce a clearly incomplete skeleton with explicit placeholders and do not invent Results or Conclusions. Never turn a simulation into clinical evidence. Final text requires author approval and is not automatically submitted.

## Packaging and completion

Save separate project artifacts when available, plus `00_package_index.md` listing mode, required inputs, each output's filename/status, evidence/limitations, blockers and next human action. The filenames above are stable ASCII identifiers; artifact contents follow the selected language except the English writing draft. Include exact links/paths only when artifacts actually exist. If saving is unavailable, provide the content inline and label it not saved. Do not claim a downloadable archive exists unless it was created.

Use “draft ready for review” only for a complete reviewable package and explicitly enumerate any unexecuted analysis. Missing required content means partial/blocked. Never infer completion from a model turn ending, a progress badge or a manifest alone.
