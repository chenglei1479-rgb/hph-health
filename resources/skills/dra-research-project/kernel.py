"""In-memory research records and review archives. No file access or entitlement changes."""


def _text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(name + " is required")
    return value.strip()


def _clone(value):
    import copy
    return copy.deepcopy(value)


def create_research_project(title, project_id):
    return {"schemaVersion": 1, "projectId": _text(project_id, "project ID"),
            "title": _text(title, "title"), "status": "draft",
            "stages": [{"id": stage, "status": "awaiting-researcher-confirmation"}
                       for stage in ["evidence", "analysis", "manuscript", "package"]],
            "evidence": [], "reviews": [], "issues": []}


def build_evidence_table(rows):
    if not isinstance(rows, list):
        raise ValueError("Evidence rows must be a list")
    seen, result = set(), []
    for value in rows:
        if not isinstance(value, dict):
            raise ValueError("Evidence row must be an object")
        row = _clone(value)
        identity = _text(row.get("id"), "evidence ID")
        if identity in seen:
            raise ValueError("Duplicate evidence ID: " + identity)
        seen.add(identity)
        row["id"] = identity
        row["missingFields"] = [key for key in ["sourceId", "sourceLocation", "excerpt", "studyDesign", "population", "outcome", "limitations"]
                                if not isinstance(row.get(key), str) or not row[key].strip()]
        row["readingScope"] = row.get("readingScope", "unverified")
        if row["readingScope"] not in ["full-text", "abstract-only", "unverified"]:
            raise ValueError("Unknown evidence reading scope")
        row["reviewStatus"] = "requires-source-and-researcher-review"
        result.append(row)
    return {"schemaVersion": 1, "status": "draft", "rows": result,
            "sourceVerificationPerformed": False}


def organize_manuscript(project, sections):
    if not isinstance(sections, list):
        raise ValueError("Manuscript sections must be a list")
    ids = {row["id"] for row in project.get("evidence", [])}
    result = []
    for section in sections:
        item = _clone(section)
        item["heading"] = _text(item.get("heading"), "section heading")
        refs = item.get("evidenceIds", [])
        if not isinstance(refs, list) or any(not isinstance(ref, str) for ref in refs):
            raise ValueError("Evidence references must be a list of IDs")
        item["unresolvedEvidenceIds"] = [ref for ref in refs if ref not in ids]
        item["reviewStatus"] = "requires-researcher-review"
        result.append(item)
    return {"status": "draft", "sections": result,
            "scientificValidityVerified": False}


def record_expert_review(project, role, run_id, findings):
    if role not in ["literature", "statistics", "writing"]:
        raise ValueError("Unknown expert role")
    if not isinstance(findings, list) or any(not isinstance(item, str) for item in findings):
        raise ValueError("Findings must be a list of strings")
    result = _clone(project)
    key = _text(run_id, "actual expert run ID")
    if any(item["runId"] == key for item in result.get("reviews", [])):
        raise ValueError("Expert run already recorded")
    result.setdefault("reviews", []).append({"role": role, "runId": key, "findings": findings[:],
                                            "verificationStatus": "requires-host-result-verification"})
    return result


def record_research_issue(project, issue):
    if not isinstance(issue, dict):
        raise ValueError("Issue must be an object")
    entry = _clone(issue)
    entry["id"] = _text(entry.get("id"), "issue ID")
    entry["summary"] = _text(entry.get("summary"), "issue summary")
    entry["owner"] = _text(entry.get("owner"), "issue owner")
    if entry.get("severity") not in ["low", "medium", "high", "blocking"]:
        raise ValueError("Unknown issue severity")
    if entry.get("status") not in ["open", "assigned", "answered", "resolved", "reopened"]:
        raise ValueError("Unknown issue status")
    if entry["status"] == "resolved":
        for key in ["resolution", "reviewedArtifactReference", "researcherAcceptanceReference"]:
            entry[key] = _text(entry.get(key), key)
    result = _clone(project)
    entries = result.setdefault("issues", [])
    previous = next((item for item in entries if item["id"] == entry["id"]), None)
    entry["history"] = _clone(previous.get("history", []) if previous else [])
    if previous:
        if previous["status"] == "resolved" and entry["status"] not in ["resolved", "reopened"]:
            raise ValueError("Resolved issue must explicitly reopen")
        entry["history"].append({key: value for key, value in previous.items() if key != "history"})
        entries[entries.index(previous)] = entry
    else:
        entries.append(entry)
    entry["approvalIndependentlyVerified"] = False
    return result


def build_research_package_manifest(project, artifacts):
    import re
    if not isinstance(artifacts, list):
        raise ValueError("Artifacts must be a list")
    entries, seen = [], set()
    for artifact in artifacts:
        item = _clone(artifact)
        identity = _text(item.get("versionId"), "artifact version ID")
        if identity in seen:
            raise ValueError("Duplicate artifact version")
        seen.add(identity)
        item["versionId"] = identity
        item["kind"] = _text(item.get("kind"), "artifact kind")
        digest = item.get("sha256")
        if digest is not None and (not isinstance(digest, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", digest)):
            raise ValueError("Invalid SHA256")
        item["checksumStatus"] = "recorded-not-independently-verified" if digest else "missing"
        entries.append(item)
    required = ["evidence", "analysis-plan", "notebook-code", "notebook-run", "manuscript"]
    kinds = {item["kind"] for item in entries}
    return {"schemaVersion": 1, "projectId": project["projectId"], "status": "proposed-not-exported",
            "artifacts": entries, "missingKinds": [kind for kind in required if kind not in kinds],
            "openIssueIds": [item["id"] for item in project.get("issues", []) if item["status"] != "resolved"],
            "exportExecuted": False, "filesVerified": False}


def prepare_expert_collaboration(project, input_versions, confirmation_reference, request_id):
    """Prepare the real host.delegate contract; never dispatch or authenticate approval here."""
    import re
    if not isinstance(input_versions, dict):
        raise ValueError("Input versions must be grouped by expert role")
    key = _text(request_id, "collaboration request ID")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,24}", key):
        raise ValueError("Use a short ASCII collaboration request ID")
    confirmation = _text(confirmation_reference, "researcher confirmation reference")
    scopes = {
        "literature": ("dra-literature-expert", "Review source locations, reading scope, contradictory evidence and source coverage."),
        "statistics": ("dra-statistics-expert", "Review the approved plan, supplied run results, assumptions, diagnostics and reproducibility. Do not execute new analysis."),
        "writing": ("dra-writing-reviewer", "Review manuscript claims against supplied evidence and observed results. Do not invent results or citations.")}
    requests = []
    schema = {"type": "object", "additionalProperties": False,
              "required": ["role", "findings", "limitations"], "properties": {
                  "role": {"enum": list(scopes)}, "limitations": {"type": "array", "items": {"type": "string"}},
                  "findings": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                      "required": ["summary", "severity", "evidenceReferences", "proposedAction"], "properties": {
                          "summary": {"type": "string", "minLength": 1},
                          "severity": {"enum": ["low", "medium", "high", "blocking"]},
                          "evidenceReferences": {"type": "array", "items": {"type": "string"}},
                          "proposedAction": {"type": "string", "minLength": 1}}}}}}
    for role, (profile, scope) in scopes.items():
        versions = input_versions.get(role)
        if not isinstance(versions, list) or not versions or len(versions) > 100:
            raise ValueError("Each expert needs explicit input artifact versions: " + role)
        versions = [_text(value, "artifact version ID") for value in versions]
        if len(set(versions)) != len(versions):
            raise ValueError("Duplicate input artifact version")
        output_schema = _clone(schema)
        output_schema["properties"]["role"] = {"const": role}
        requests.append({"name": key + "-" + role, "profile": profile, "inputs": versions,
                         "task": "Baselio project: " + _text(project.get("title"), "title") + ". " + scope +
                         " Use only the supplied immutable inputs. Report limitations explicitly. Submit the structured output through host.submitOutput. An expert response does not close an issue.",
                         "outputSchema": output_schema})
    return {"status": "prepared-not-dispatched", "confirmationReference": confirmation,
            "approvalIndependentlyVerified": False, "requests": requests,
            "options": {"wait": False}, "dispatchExecuted": False}


def consolidate_expert_collaboration(project, observations):
    """Validate supplied host.collect results and preserve non-completed work as unresolved."""
    import re
    if not isinstance(observations, list) or len(observations) > 3:
        raise ValueError("Supply up to three expert observations")
    result = _clone(project)
    roles, identities, pending = set(), set(), []
    for observation in observations:
        if not isinstance(observation, dict):
            raise ValueError("Expert observation must be an object")
        frame = _text(observation.get("frameId"), "actual expert frame ID")
        attempt = _text(observation.get("attemptId"), "actual expert attempt ID")
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,200}", attempt):
            raise ValueError("Invalid expert attempt ID")
        identity = (frame, attempt)
        if identity in identities:
            raise ValueError("Duplicate expert observation")
        identities.add(identity)
        status = observation.get("status")
        if status not in ["running", "awaiting_user", "completed", "cancelled", "error"]:
            raise ValueError("Unknown expert status")
        output = observation.get("structuredOutput")
        if status != "completed" or observation.get("error") or observation.get("structuredOutputUnsatisfied"):
            pending.append({"frameId": frame, "attemptId": attempt, "status": status, "usable": False})
            continue
        if not isinstance(output, dict) or output.get("role") not in ["literature", "statistics", "writing"]:
            raise ValueError("Completed expert result needs its validated role")
        role = output["role"]
        if role in roles:
            raise ValueError("Duplicate expert role")
        roles.add(role)
        findings, limitations = output.get("findings"), output.get("limitations")
        if not isinstance(findings, list) or not isinstance(limitations, list) or any(not isinstance(value, str) for value in limitations):
            raise ValueError("Invalid expert output")
        summaries = []
        for index, finding in enumerate(findings):
            if not isinstance(finding, dict):
                raise ValueError("Finding must be an object")
            refs = finding.get("evidenceReferences")
            if not isinstance(refs, list) or any(not isinstance(value, str) for value in refs):
                raise ValueError("Finding needs evidence references")
            summary = _text(finding.get("summary"), "finding summary")
            result = record_research_issue(result, {
                "id": attempt + "-finding-" + str(index + 1), "summary": summary, "owner": role,
                "severity": finding.get("severity"), "status": "open", "evidenceReferences": refs,
                "proposedAction": _text(finding.get("proposedAction"), "proposed action"),
                "expertFrameId": frame, "expertAttemptId": attempt})
            summaries.append(summary)
        result = record_expert_review(result, role, attempt, summaries)
        result["reviews"][-1].update({"frameId": frame, "attemptId": attempt, "limitations": limitations[:]})
    result["collaboration"] = {"status": "reported-all-completed" if len(roles) == 3 and not pending else "incomplete",
                               "completedRoles": sorted(roles), "missingRoles": sorted(set(["literature", "statistics", "writing"]) - roles),
                               "pending": pending, "hostEvidenceIndependentlyVerified": False}
    return result


def build_research_review_bundle(project, evidence_rows, sections, notebook_runs):
    """Generate an actual bounded ZIP in memory; publishing remains the host artifact tool's job."""
    import base64
    import csv
    import hashlib
    import io
    import json
    import zipfile
    table = build_evidence_table(evidence_rows)
    normalized = _clone(project)
    normalized["evidence"] = table["rows"]
    manuscript = organize_manuscript(normalized, sections)
    if not isinstance(notebook_runs, list) or len(notebook_runs) > 1000:
        raise ValueError("Supply at most 1000 actual Notebook run records")
    cells, runs, seen = [], [], set()
    for supplied in notebook_runs:
        if not isinstance(supplied, dict):
            raise ValueError("Notebook run must be an object")
        run = {key: _clone(supplied[key]) for key in ["runId", "status", "executionMode", "language", "script", "stdout", "stderr", "inputVersionIds", "environmentReference"] if key in supplied}
        run_id = _text(run.get("runId"), "actual Notebook run ID")
        if run_id in seen:
            raise ValueError("Duplicate Notebook run ID")
        seen.add(run_id)
        if run.get("language") != "python":
            raise ValueError("Review notebook export requires explicitly identified Python runs")
        if run.get("status") not in ["completed", "failed", "timeout", "interrupted", "cancelled"] or run.get("executionMode") not in ["foreground", "background"]:
            raise ValueError("Only terminal Notebook run records may be exported")
        script = _text(run.get("script"), "Notebook code")
        stdout, stderr = run.get("stdout", ""), run.get("stderr", "")
        if not isinstance(stdout, str) or not isinstance(stderr, str):
            raise ValueError("Notebook output must be text")
        inputs = run.get("inputVersionIds", [])
        if not isinstance(inputs, list) or any(not isinstance(value, str) or not value.strip() for value in inputs):
            raise ValueError("Notebook inputs must reference explicit artifact versions")
        run["hostEvidenceIndependentlyVerified"] = False
        runs.append(run)
        outputs = [{"output_type": "stream", "name": name, "text": text.splitlines(True)} for name, text in [("stdout", stdout), ("stderr", stderr)] if text]
        cells.append({"cell_type": "code", "id": "run-" + hashlib.sha256(run_id.encode()).hexdigest()[:16],
                      "execution_count": None, "metadata": {"dra": {"runId": run_id, "status": run["status"], "executionMode": run["executionMode"], "capturedNotReexecuted": True}},
                      "source": script.splitlines(True), "outputs": outputs})
    notebook = {"nbformat": 4, "nbformat_minor": 5, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}, "dra": {"capturedNotReexecuted": True, "hostEvidenceIndependentlyVerified": False}}, "cells": cells}
    csv_buffer = io.StringIO(newline="")
    columns = ["id", "sourceId", "sourceLocation", "excerpt", "studyDesign", "population", "outcome", "limitations", "readingScope", "reviewStatus"]
    writer = csv.DictWriter(csv_buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in table["rows"]:
        # Spreadsheet exports must not interpret source text as a formula.
        writer.writerow({key: ("'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value)
                         for key in columns for value in [str(row.get(key, ""))]})
    markdown = "# " + _text(project.get("title"), "title") + "\n\nDraft: requires researcher review.\n"
    for section in manuscript["sections"]:
        body = section.get("text", "")
        if not isinstance(body, str):
            raise ValueError("Manuscript text must be a string")
        markdown += "\n## " + section["heading"] + "\n\n" + body + "\n\nEvidence: " + ", ".join(section.get("evidenceIds", [])) + "\n"
    warnings = ["Review archive only; input datasets, external sources and runtime environments are not bundled.", "Captured Notebook outputs are not a new execution and require host-log verification.", "Researcher approval, source accuracy and scientific validity are not authenticated by this helper."]
    if not table["rows"]: warnings.append("No evidence rows supplied.")
    if not runs: warnings.append("No actual Notebook runs supplied.")
    if not manuscript["sections"]: warnings.append("No manuscript sections supplied.")
    project_record = {key: _clone(project[key]) for key in ["schemaVersion", "projectId", "title", "status", "stages", "analysisPlanReference", "researcherConfirmationReference", "collaboration"] if key in project}
    if not project_record.get("analysisPlanReference"):
        warnings.append("No approved analysis-plan artifact reference supplied.")
    unresolved = sorted({ref for section in manuscript["sections"] for ref in section["unresolvedEvidenceIds"]})
    if unresolved: warnings.append("Unresolved manuscript references: " + ", ".join(unresolved))
    payloads = {"README.md": ("# Baselio research review archive\n\n" + "\n".join("- " + warning for warning in warnings) + "\n").encode(),
                "evidence.csv": csv_buffer.getvalue().encode("utf-8-sig"), "manuscript.md": markdown.encode(),
                "evidence.json": json.dumps(table, ensure_ascii=False, indent=2).encode(),
                "notebook.ipynb": json.dumps(notebook, ensure_ascii=False, indent=2).encode(),
                "notebook-runs.json": json.dumps(runs, ensure_ascii=False, indent=2).encode(),
                "reviews.json": json.dumps(project.get("reviews", []), ensure_ascii=False, indent=2).encode(),
                "project.json": json.dumps(project_record, ensure_ascii=False, indent=2).encode(),
                "issues.json": json.dumps(project.get("issues", []), ensure_ascii=False, indent=2).encode()}
    if sum(map(len, payloads.values())) > 1024 * 1024:
        raise ValueError("Review archive exceeds the 1 MiB inline budget; use native session export")
    manifest = {"schemaVersion": 1, "projectId": _text(project.get("projectId"), "project ID"),
                "kind": "research-review-archive", "scientificValidityVerified": False,
                "hostEvidenceIndependentlyVerified": False, "warnings": warnings,
                "openIssueIds": [item["id"] for item in project.get("issues", []) if item.get("status") != "resolved"],
                "files": [{"path": name, "sizeBytes": len(content), "sha256": hashlib.sha256(content).hexdigest()} for name, content in sorted(payloads.items())]}
    payloads["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(payloads.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    content = buffer.getvalue()
    return {"filename": "dra-research-review.zip", "mimeType": "application/zip", "encoding": "base64",
            "content": base64.b64encode(content).decode(), "sizeBytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(), "archiveGenerated": True,
            "published": False, "manifest": manifest}


def summarize_research_usage(events):
    """Aggregate supplied local run metadata without copying research text or estimating savings."""
    import math
    if not isinstance(events, list) or len(events) > 10000:
        raise ValueError("Supply at most 10000 local run metadata records")
    counts = {status: 0 for status in ["queued", "running", "completed", "failed", "timeout", "interrupted", "cancelled"]}
    seen, intervals, terminal_duration, missing = set(), [], 0, 0
    for event in events:
        if not isinstance(event, dict): raise ValueError("Usage event must be an object")
        identity = _text(event.get("runId"), "actual run ID")
        if identity in seen: raise ValueError("Duplicate usage run ID")
        seen.add(identity)
        status = event.get("status")
        if status not in counts: raise ValueError("Unknown usage run status")
        counts[status] += 1
        start, end = event.get("startedAt"), event.get("endedAt")
        if status in ["queued", "running"] or start is None or end is None:
            missing += 1
            continue
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 for value in [start, end]) or end < start:
            raise ValueError("Invalid run timing")
        intervals.append((start, end))
        terminal_duration += end - start
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], end)
        else: merged.append([start, end])
    terminal = sum(counts[status] for status in ["completed", "failed", "timeout", "interrupted", "cancelled"])
    return {"schemaVersion": 1, "runCounts": counts, "terminalRunCompletionRate": counts["completed"] / terminal if terminal else None,
            "summedTerminalRunMilliseconds": terminal_duration, "nonOverlappingRunMilliseconds": sum(end - start for start, end in merged),
            "runsWithoutTerminalTiming": missing, "researchSuccessVerified": False,
            "researcherActiveTimeMilliseconds": None, "attendedWaitingMilliseconds": None,
            "verificationTimeMilliseconds": None, "reworkTimeMilliseconds": None,
            "timeSavingsVerified": False, "quotaEnforced": False, "remoteTelemetrySent": False}
