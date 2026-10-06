import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "cli"))

from project_alpha import init, main
from project_alpha_integrity import run_integrity_audit
from project_alpha_workflow import record


class CanonicalRecordTests(unittest.TestCase):
    def make_project(self, tmp: str) -> Path:
        project = Path(tmp) / "demo"
        args = type("Args", (), {"path": str(project), "name": "Demo", "repository": "acme/demo", "idea": "Test", "force": False})()
        self.assertEqual(init(args), 0)
        return project

    def test_evidence_command_produces_integrity_valid_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            path = record(project, "evidence", {
                "evidence_id": "EVID-M5", "claim": "Claim", "source": "https://example.com",
                "date": "2026-09-13", "confidence": "high", "type": "FACT", "risk": "LOW", "stage": "03-market-research",
            })
            self.assertTrue(path.exists())
            code, status, findings = run_integrity_audit(project)
            self.assertEqual((code, status), (0, "PASS"), findings)

    def test_decision_and_approval_records_are_canonical(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            record(project, "evidence", {
                "evidence_id": "EVID-M5", "claim": "Claim", "source": "https://example.com",
                "date": "2026-09-13", "confidence": "high", "type": "FACT", "risk": "LOW",
            })
            record(project, "decision", {
                "decision_id": "DEC-M5", "stage": "04-prd", "title": "Choose X", "decision": "Choose X",
                "context": "Test", "chosen_option": "X", "rationale": "Best option", "impact": "Medium",
                "reversibility": "High", "risk": "MEDIUM", "evidence": "EVID-M5",
                "approval_required": "yes", "approval_status": "pending",
            })
            record(project, "approval", {
                "approval_id": "APR-M5", "stage": "04-prd", "decision_id": "DEC-M5",
                "decision": "Choose X", "status": "approved", "approver": "human", "evidence": "EVID-M5",
            })
            code, status, findings = run_integrity_audit(project)
            self.assertEqual((code, status), (0, "PASS"), findings)

    def test_evidence_cli_entrypoint_writes_record_and_event(self):
        # Exercises argparse dispatch: the handler stored in the namespace must not leak into the event payload.
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            argv = [
                "project-alpha", "evidence", str(project), "--evidence-id", "EVID-CLI", "--stage", "03-market-research",
                "--claim", "Claim", "--source", "https://example.com", "--date", "2026-09-13",
                "--confidence", "high", "--type", "FACT", "--risk", "LOW",
            ]
            with mock.patch.object(sys, "argv", argv):
                self.assertEqual(main(), 0)
            self.assertTrue((project / "docs" / "evidence" / "EVID-CLI.md").exists())
            events = list((project / ".project-alpha" / "history" / "events").glob("*-evidence-recorded.json"))
            self.assertEqual(len(events), 1)
            self.assertNotIn("func", json.loads(events[0].read_text(encoding="utf-8")))

    def test_handoff_record_creates_ready_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            path = record(project, "handoff", {
                "from_stage": "01-vision", "to_stage": "02-problem-discovery", "framework_version": "1.0.0",
                "reason": "Gate passed",
            })
            self.assertTrue(path.exists())
            self.assertIn("- Status: READY", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
