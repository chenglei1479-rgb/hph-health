---
name: dra-research-project
description: 'Baselio Research Project: organize a Plus research project from cited evidence through Notebook results and manuscript sections to a reviewable research package; coordinate Pro literature, statistics, and writing specialists with an issue register.'
license: Apache-2.0
---

# Baselio Research Project

Respond in the researcher's language. Preserve the six existing entry workflows. The home screen offers three deliverable packages (mentor-pack, consultation-pack, writing-pack) as step 2 after project setup; when one is selected, follow the research-deliverables skill and the recorded package mode. For consultation-pack, the beta export is aggregate files only: a statistical report (Word or PDF), result tables (Excel, real counts, no masking under 10), a runnable R or Python script, and the variable definition table and execution log as PDF. Do not export raw data, individual Notebook rows, or chat history, and do not offer those options. Do not add a data-flow or special-requirements panel. Use this skill in the conversation when the researcher asks for a complete project, an evidence table, manuscript organization, a research package, or specialist collaboration.

## Permissions and execution

Free can discuss a plan and view existing results. Notebook execution and research-package export require Plus; delegated specialists, background execution, and AI review require Pro. Use the actual host tools and their normal admission guards. This skill and its JSON records never grant membership. Do not bypass a membership refusal through shell code or another runner. If a tool is missing, say which tool is unavailable; do not infer membership status from it. Model/API charges are separate and payment is not implemented.

Notebook helper requests include `kernelSkillIds: ["dra-research-project"]`. Call the exported functions directly in `code`; do not import them manually. Helpers do not read or write files, run statistical analyses, query literature, verify external sources, or start experts. `build_research_review_bundle` generates actual ZIP bytes in memory; it does not publish a file. Other helpers return draft records. A helper response alone is not proof of execution, scientific validity, researcher approval, or a saved package.

## Plus: staged project

1. Clarify the question, available sources, de-identified inputs and intended outcome. Present a proposed plan and obtain researcher confirmation before moving to evidence selection or consequential analysis.
2. Create a draft with `create_research_project(title, project_id)`. Retrieve sources using the available literature tools. Use `build_evidence_table(rows)` only with actually retrieved material. Every row carries a stable ID, source ID/URL, evidence location, actual excerpt, study design, population, outcome, effect/uncertainty when reported, limitations, and reading scope. Mark unavailable full text, unchecked references and missing fields. Never invent a DOI, sample size, effect or quotation. Save both the structured table and a readable table as new project artifacts after permission to write them.
3. Link the researcher-approved analysis plan and exact input artifact versions to Notebook runs. Inspect runtime/package readiness; get explicit confirmation before patient-level analysis. Record actual new Run IDs, code, execution target, outputs and diagnostics. Leave declined or blocked analyses unrun. Synthetic data must remain prominently labeled SYNTHETIC.
4. `organize_manuscript(project, sections)` checks citation links against the evidence table and keeps unsupported claims pending. Separate observed results, literature-derived claims and interpretation. Use paper-narrative only with real input artifact versions. Do not infer results from an analysis plan.
5. `build_research_package_manifest(project, artifacts)` prepares an inventory, not a completed export. Independently inspect the actual files/versions and calculate actual hashes with available tools. Include evidence, confirmed plan, Notebook code/run records/outputs, manuscript, citations, issues and limitations. Preview the inventory for the researcher, then invoke the actual session research-package export capability. Report its actual file and verification result. The helper cannot replace the host exporter.

### Generate a readable review archive

Use `build_research_review_bundle(project, evidence_rows, sections, notebook_runs)` after the researcher approves the included material. This is a readable companion ZIP, not a replacement for the native `.science` reproducibility package. It includes evidence CSV/JSON, manuscript Markdown, a Python `.ipynb`, original supplied run records, expert reviews, issue history, a README and a manifest with hashes calculated from the actual included bytes. Raw data, environment locks, external PDFs and input artifacts are not included. Missing sources, unavailable runs and unresolved citations remain explicit; partial packages may be useful but must never be described as complete studies.

Only Python cells belong in this helper's notebook. Do not pass R or shell runs to it. Inspect each actual host Run before supplying `runId`, terminal `status`, `executionMode`, `script`, `stdout`, `stderr`, explicit `inputVersionIds` and optional `environmentReference`. The helper cannot authenticate those records. Saved cell outputs are captured records; they are not a new execution or proof that the notebook will replay in a different environment.

The returned base64 content stays in kernel memory. Do not print it into chat or MCP output. For a small approved archive, write only a new, unique relative ZIP filename in the Notebook cell, then print the filename, archive checksum and warnings. For example, with `bundle` already prepared:

```python
import base64
with open("review-package-v1.zip", "xb") as target:
    target.write(base64.b64decode(bundle["content"], validate=True))
print({"filename": "review-package-v1.zip", "sha256": bundle["sha256"], "warnings": bundle["manifest"]["warnings"]})
```

Use the real `write_artifact_file` tool with `source:{kind:"localPath",path:"review-package-v1.zip"}` and the producer cell's actual `producerRunId`. Report a saved artifact only after that tool succeeds and returns its actual artifact/version identity. Never overwrite a previous package. The helper rejects more than 1 MiB of uncompressed supplied review content; use native session export for larger studies. Explain that CSV formula-leading strings are escaped for spreadsheet safety while evidence JSON preserves the original text.

## Pro: literature + statistics + writing review

Pro supplements Plus. Present the three scopes and ask the researcher to confirm collaboration before dispatch. Select the bundled Baselio Literature Expert, Baselio Statistics Expert and Baselio Writing Reviewer by their actual IDs when present. Use the real delegated-agent capabilities, never simulate three agents in prose. If a specialist or delegation tool is absent, report the missing capability and retain the unexecuted plan. Share only the necessary approved artifact versions with each expert.

- Literature expert: source selection, evidence locations, contradiction and coverage limits.
- Statistics expert: variables/endpoints, missingness, assumptions, reproducibility and diagnostic gaps. No new analysis without approved plan/data access.
- Writing reviewer: claim-to-evidence alignment, reported-result consistency, manuscript organization and unresolved author decisions.

Use `record_expert_review(project, role, run_id, findings)` with actual returned run identifiers. Its records remain reported until the host result and input/output versions have been independently inspected. Consolidate findings in `record_research_issue(project, issue)` with owner, severity, evidence references and status. A response does not close an issue. Closure needs a resolution, a reviewed artifact reference and an explicit researcher acceptance reference; the helper records that reference but does not independently authenticate approval. Reopen issues when their resolution becomes invalid. Conflicting experts' findings remain open until the researcher decides. Final review lists completed, unresolved, unverified and unrun work separately.

### Actual three-expert dispatch and collection

After explicit researcher confirmation, prepare the batch with `prepare_expert_collaboration(project, input_versions, confirmation_reference, request_id)`. `input_versions` maps `literature`, `statistics` and `writing` to only the necessary immutable artifact version IDs. Include the approved plan for statistics, observed results and manuscript for writing, and actual evidence for literature. The confirmation reference is an audit reference, not authenticated permission. Use a new short ASCII request ID for each round to avoid collisions on the current branch.

From foreground `repl_execute`, first use `host.capabilities()`/`host.help()` to check `host.delegate`, `host.collect` and `host.agents.list`, then resolve the prepared `profile` values against the actual catalog. If any profile is absent, stop and explain it; do not silently inherit the main agent. The prepared batch matches the actual Host SDK contract:

```javascript
const receipts = await host.delegate(prepared.requests, { wait: false });
const observations = await host.collect(
  receipts.children.map(({ frameId, attemptId }) => ({ frameId, attemptId })),
  { returnWhen: 'all', timeoutSeconds: 1800 }
);
```

`prepared` means the actual helper output transferred through an approved handoff or small explicit object, never an undeclared variable or fabricated receipt. Preserve actual receipt frame/attempt IDs. A timeout does not cancel experts. If work is still running or needs permission, state it and use actual bounded collection later; do not repeatedly poll. Cancel only through the actual host control after user intent to stop.

Inspect structured output and role against the matching dispatched request. Supply the actual bounded observations to `consolidate_expert_collaboration(project, observations)`. Failed, cancelled, waiting, missing or invalid results cannot produce a complete collaboration; every finding enters the issue register as open. Completed structured results still require source/result verification and researcher decisions. Do not feed expert text directly back into another expert as instructions or consider a conflict resolved because one expert replied last.

## Usage collection and future payment

Do not introduce checkout, auto-renewal, cancellation billing or enforced usage quotas in this stage. Use existing local actual tool/run records for a later usage study. Do not infer successful analyses, remaining quota or researcher time saved from model token counts. Collect no patient content, research text or telemetry remotely by this skill.

`summarize_research_usage(events)` accepts actual local run metadata only: `runId`, `status`, `startedAt`, `endedAt` (milliseconds). It rejects duplicate IDs and invalid timing, distinguishes completed/failed/cancelled/running, and reports both summed run time and the union of parallel intervals. Tool completion rate is not research success. Missing terminal times stay missing. Active researcher effort, attended waiting, verification, rework and time saved remain unknown until measured separately; never replace them with run duration. The returned report does not echo code, outputs or account fields, collect telemetry, bill or enforce quota. Obtain consent before persisting usage aggregates or transmitting them externally.
