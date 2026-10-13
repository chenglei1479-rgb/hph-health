"""Synthetic in-memory records only; no researcher data or actual Notebook execution."""
import importlib.util
from pathlib import Path
import unittest
import base64
import csv
import hashlib
import io
import json
import zipfile

source = Path(__file__).resolve().parents[1] / "resources/skills/dra-research-project/kernel.py"
spec = importlib.util.spec_from_file_location("dra_test_helper", source)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.project = helper.create_research_project("SYNTHETIC test", "test-project")

    def test_sources_remain_unverified_and_missing_fields_are_explicit(self):
        table = helper.build_evidence_table([{"id": "E1", "readingScope": "abstract-only"}])
        self.assertFalse(table["sourceVerificationPerformed"])
        self.assertIn("excerpt", table["rows"][0]["missingFields"])
        self.assertEqual(table["rows"][0]["readingScope"], "abstract-only")
        with self.assertRaises(ValueError):
            helper.build_evidence_table([{"id": "E1"}, {"id": "E1"}])

    def test_manuscript_flags_unknown_citations(self):
        self.project["evidence"] = [{"id": "E1"}]
        result = helper.organize_manuscript(self.project, [{"heading": "Discussion", "evidenceIds": ["E1", "missing"]}])
        self.assertEqual(result["sections"][0]["unresolvedEvidenceIds"], ["missing"])
        self.assertFalse(result["scientificValidityVerified"])

    def test_issue_closure_requires_resolution_review_and_researcher_reference(self):
        issue = {"id": "I1", "summary": "Unrun diagnostics", "owner": "statistics", "severity": "blocking", "status": "open"}
        opened = helper.record_research_issue(self.project, issue)
        self.assertEqual(self.project["issues"], [])
        with self.assertRaises(ValueError):
            helper.record_research_issue(opened, {**issue, "status": "resolved"})
        closed = helper.record_research_issue(opened, {**issue, "status": "resolved", "resolution": "Diagnostic inspected", "reviewedArtifactReference": "test-version", "researcherAcceptanceReference": "test-only acceptance reference"})
        self.assertFalse(closed["issues"][0]["approvalIndependentlyVerified"])
        self.assertEqual(len(closed["issues"][0]["history"]), 1)
        with self.assertRaises(ValueError):
            helper.record_research_issue(closed, issue)
        reopened = helper.record_research_issue(closed, {**issue, "status": "reopened"})
        self.assertEqual(len(reopened["issues"][0]["history"]), 2)

    def test_review_records_require_run_ids_and_never_claim_actual_host_verification(self):
        with self.assertRaises(ValueError):
            helper.record_expert_review(self.project, "statistics", "", [])
        reviewed = helper.record_expert_review(self.project, "statistics", "test-only-run", ["Needs diagnostics"])
        self.assertEqual(reviewed["reviews"][0]["verificationStatus"], "requires-host-result-verification")
        with self.assertRaises(ValueError):
            helper.record_expert_review(reviewed, "writing", "test-only-run", [])

    def test_manifest_is_an_inventory_and_not_export_or_file_verification(self):
        result = helper.build_research_package_manifest(self.project, [{"kind": "evidence", "versionId": "test-v1"}])
        self.assertFalse(result["exportExecuted"])
        self.assertFalse(result["filesVerified"])
        self.assertIn("notebook-run", result["missingKinds"])
        with self.assertRaises(ValueError):
            helper.build_research_package_manifest(self.project, [{"kind": "evidence", "versionId": "test-v1", "sha256": "invalid"}])

    def test_archive_has_actual_bytes_hashes_notebook_and_open_issue_history(self):
        issue = {"id": "I1", "summary": "SYNTHETIC unresolved", "owner": "writing", "severity": "high", "status": "open"}
        project = helper.record_research_issue(self.project, issue)
        run = {"runId": "SYNTHETIC-run-1", "status": "completed", "executionMode": "foreground", "language": "python", "script": "print(31*37)", "stdout": "1147\n", "inputVersionIds": []}
        args = (project, [{"id": "E1", "sourceId": "=UNTRUSTED()", "readingScope": "abstract-only"}], [{"heading": "Discussion", "text": "SYNTHETIC draft", "evidenceIds": ["E1", "E2"]}], [run])
        bundle = helper.build_research_review_bundle(*args)
        content = base64.b64decode(bundle["content"], validate=True)
        self.assertEqual(hashlib.sha256(content).hexdigest(), bundle["sha256"])
        self.assertEqual(bundle["content"], helper.build_research_review_bundle(*args)["content"])
        self.assertFalse(bundle["published"])
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            for entry in manifest["files"]:
                data = archive.read(entry["path"])
                self.assertEqual(len(data), entry["sizeBytes"])
                self.assertEqual(hashlib.sha256(data).hexdigest(), entry["sha256"])
            notebook = json.loads(archive.read("notebook.ipynb"))
            self.assertEqual(notebook["cells"][0]["outputs"][0]["text"], ["1147\n"])
            self.assertIsNone(notebook["cells"][0]["execution_count"])
            self.assertTrue(notebook["metadata"]["dra"]["capturedNotReexecuted"])
            rows = list(csv.DictReader(io.StringIO(archive.read("evidence.csv").decode("utf-8-sig"))))
            self.assertEqual(rows[0]["sourceId"], "'=UNTRUSTED()")
            self.assertEqual(json.loads(archive.read("evidence.json"))["rows"][0]["sourceId"], "=UNTRUSTED()")
            self.assertEqual(manifest["openIssueIds"], ["I1"])
            self.assertTrue(any("E2" in warning for warning in manifest["warnings"]))

    def test_archive_rejects_active_runs_duplicate_runs_and_oversize_text(self):
        run = {"runId": "SYNTHETIC-run", "status": "running", "executionMode": "foreground", "language": "python", "script": "print(1)"}
        with self.assertRaises(ValueError):
            helper.build_research_review_bundle(self.project, [], [], [run])
        run["status"] = "completed"
        with self.assertRaises(ValueError):
            helper.build_research_review_bundle(self.project, [], [], [run, run])
        with self.assertRaises(ValueError):
            helper.build_research_review_bundle(self.project, [], [], [{**run, "language": "r"}])
        with self.assertRaises(ValueError):
            helper.build_research_review_bundle(self.project, [], [{"heading": "Draft", "text": "x" * (1024*1024)}], [])

    def test_expert_requests_pin_inputs_and_have_distinct_roles_and_real_contract(self):
        versions = {role: ["SYNTHETIC-v1"] for role in ["literature", "statistics", "writing"]}
        plan = helper.prepare_expert_collaboration(self.project, versions, "SYNTHETIC-confirmation", "review1")
        self.assertEqual(len(plan["requests"]), 3)
        self.assertFalse(plan["dispatchExecuted"])
        self.assertFalse(plan["approvalIndependentlyVerified"])
        for request in plan["requests"]:
            self.assertEqual(request["inputs"], ["SYNTHETIC-v1"])
            self.assertIn("outputSchema", request)
            self.assertTrue(request["profile"].startswith("dra-"))
        with self.assertRaises(ValueError):
            helper.prepare_expert_collaboration(self.project, {}, "SYNTHETIC-confirmation", "review1")

    def test_expert_partial_failure_never_marks_all_completed_or_resolves_issues(self):
        finding = {"summary": "Check source", "severity": "blocking", "evidenceReferences": ["E1"], "proposedAction": "Inspect source"}
        observations = [{"frameId": "frame-1", "attemptId": "attempt-1", "status": "completed", "structuredOutput": {"role": "literature", "findings": [finding], "limitations": ["SYNTHETIC only"]}}, {"frameId": "frame-2", "attemptId": "attempt-2", "status": "error", "error": "Test failure"}]
        result = helper.consolidate_expert_collaboration(self.project, observations)
        self.assertEqual(result["collaboration"]["status"], "incomplete")
        self.assertEqual(result["issues"][0]["status"], "open")
        self.assertIn("statistics", result["collaboration"]["missingRoles"])
        self.assertFalse(result["collaboration"]["hostEvidenceIndependentlyVerified"])
        self.assertEqual(self.project["issues"], [])
        with self.assertRaises(ValueError):
            helper.consolidate_expert_collaboration(self.project, observations[:1] * 2)

    def test_all_experts_complete_still_requires_researcher_issue_acceptance(self):
        observations = [{"frameId": "frame-" + role, "attemptId": "attempt-" + role, "status": "completed", "structuredOutput": {"role": role, "findings": [], "limitations": []}} for role in ["literature", "statistics", "writing"]]
        result = helper.consolidate_expert_collaboration(self.project, observations)
        self.assertEqual(result["collaboration"]["status"], "reported-all-completed")
        self.assertEqual(len(result["reviews"]), 3)
        self.assertFalse(result["collaboration"]["hostEvidenceIndependentlyVerified"])

    def test_usage_deduplicates_and_unions_parallel_time_without_claiming_savings(self):
        events = [{"runId": "a", "status": "completed", "startedAt": 0, "endedAt": 1000, "script": "PRIVATE CONTENT"}, {"runId": "b", "status": "failed", "startedAt": 500, "endedAt": 1500}, {"runId": "c", "status": "running"}]
        result = helper.summarize_research_usage(events)
        self.assertEqual(result["summedTerminalRunMilliseconds"], 2000)
        self.assertEqual(result["nonOverlappingRunMilliseconds"], 1500)
        self.assertEqual(result["terminalRunCompletionRate"], .5)
        self.assertNotIn("PRIVATE CONTENT", json.dumps(result))
        self.assertFalse(result["timeSavingsVerified"])
        self.assertIsNone(helper.summarize_research_usage([])["terminalRunCompletionRate"])
        with self.assertRaises(ValueError): helper.summarize_research_usage(events + events[:1])
        with self.assertRaises(ValueError): helper.summarize_research_usage([{"runId": "bad", "status": "completed", "startedAt": 2, "endedAt": 1}])


if __name__ == "__main__":
    unittest.main()
