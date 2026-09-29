---
name: biomedical-discovery
description: >
  Plan and conduct evidence-grounded biomedical discovery across literature,
  therapeutic indications, omics, proteins, and translational research. Use
  available DRA skills and connected tools, with researcher approval at
  consequential stage transitions.
license: Apache-2.0
category: research
---

# Biomedical Discovery

This is a DRA-native, Biomni-inspired research workflow. It coordinates capabilities already installed in DRA; it is not the Stanford Biomni A1 runtime, its data lake, or a claim of tool parity. Never imply that an optional model, database, connector, or compute backend is available unless it is present in the current session.

## Workflow

1. **Frame the question.** Clarify the population, disease or biological system, intervention/exposure, comparator, outcomes, study type, and intended use. For clinical questions, propose PICO/PECO; for molecular questions, identify the organism, assay, molecules, and biological context. Separate the user's hypothesis from established evidence.
2. **Agree on the plan.** Present a concise research question, search scope, sources to query, inclusion/exclusion criteria, and intended analysis. Wait for the researcher to confirm or revise the plan before broad searches, cohort definitions, or consequential analysis.
3. **Retrieve and verify evidence.** Use the available literature-review and indication-dossier capabilities, plus connected biomedical sources when present. Prefer primary records where appropriate. Verify PMID/DOI, title, journal, year, and record status against the retrieved source. Attach citations to claims; mark missing identifiers, preprints, retractions, conflicting results, and unverified claims explicitly. Do not invent citations or claim exhaustive coverage from a limited search.
4. **Synthesize and identify gaps.** Compare methods, populations, endpoints, findings, and limitations across retrieved studies. Label a research gap or novelty assessment as provisional and show which searched sources support it. Check trial registries such as ClinicalTrials.gov or jRCT only when the relevant search capability is actually available; state the search date and coverage.
5. **Use domain tools selectively.** Match the confirmed question to installed DRA skills (for example, single-cell analysis or protein structure/design tools). Check each skill's prerequisites, model/checkpoint license, data requirements, and output limitations before proposing it. If a required tool is absent, explain the gap and offer a feasible alternative instead of implying the analysis ran.
6. **Plan data analysis before execution.** Before opening a clinical dataset, check that direct identifiers have been removed and that the user has authority to use it for the stated purpose. Do not send patient-level or otherwise confidential data to public search services, unapproved external models, or third-party tools. First report the proposed variables, exclusions, missingness handling, statistical methods, and reproducibility outputs; obtain explicit researcher approval before executing code against patient data. Use only an available, appropriately isolated DRA analysis environment; do not run generated code with unrestricted host or main-process privileges.
7. **Report reproducibly.** Keep a trace from each scientific claim to its source, and from each numerical result to the input data, code, method, and execution environment when available. Distinguish observed results, model outputs, interpretations, and hypotheses. Include assumptions, uncertainty, missing-data decisions, and limitations. Do not present an exploratory finding as confirmatory.
8. **Require human sign-off.** Ask the researcher to confirm the question/design, search strategy and eligibility decisions, statistical plan, and patient-data code execution at the relevant stages. Treat the researcher as the final authority for clinical interpretation, ethics/regulatory decisions, and manuscript submission. Drafts require human review; never claim that AI completed or validated a study.

## Response format

Use the user's language. At each stage, give the proposed output and its evidence/limitations, then ask for approval only when the next step would materially broaden the search, commit a design choice, access or analyze patient data, or produce a consequential research artifact. Preserve decisions and version changes in the active project when project memory is available; do not claim persistent memory if it is unavailable.
