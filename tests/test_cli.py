import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("project_alpha", ROOT / "cli" / "project_alpha.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
integrity_spec = importlib.util.spec_from_file_location("project_alpha_integrity", ROOT / "cli" / "project_alpha_integrity.py")
integrity = importlib.util.module_from_spec(integrity_spec)
integrity_spec.loader.exec_module(integrity)


class ProjectAlphaCLITests(unittest.TestCase):
    def make_project(self, tmp: str) -> Path:
        project = Path(tmp) / "demo"
        args = type("Args", (), {"path": str(project), "name": "Demo", "repository": "acme/demo", "idea": "Test idea", "force": False})()
        self.assertEqual(module.init(args), 0)
        return project

    def pass_idea_selection(self, project: Path) -> None:
        output = project / "docs" / "idea-selection" / "OUTPUT.md"
        output.write_text("# Selected Idea\n\nA concrete test product direction.\n", encoding="utf-8")
        module.transition(project, "idea-selection", "start")
        module.transition(project, "idea-selection", "review")
        module.transition(project, "idea-selection", "pass", approved_by="human")

    def pass_vision(self, project: Path) -> None:
        self.pass_idea_selection(project)
        output = project / "docs" / "01-vision" / "OUTPUT.md"
        output.write_text("# Vision\n\nMission, vision, goals, principles, assumptions, and open questions.\n", encoding="utf-8")
        module.transition(project, "01-vision", "start")
        module.transition(project, "01-vision", "review")
        module.transition(project, "01-vision", "pass", approved_by="human")

    def test_init_creates_layered_runtime_state_and_event_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.assertTrue((project / ".project-alpha" / "project-state.md").exists())
            self.assertTrue((project / ".project-alpha" / "state.json").exists())
            self.assertEqual(len(list((project / ".project-alpha" / "history" / "events").glob("*.json"))), 1)
            self.assertTrue((project / "docs" / "01-vision" / "STAGE.md").exists())
            self.assertTrue((project / "docs" / "10-operations" / "OUTPUT.md").exists())

    def test_fresh_project_validates_with_warnings_not_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(module.validate(self.make_project(tmp)), 0)

    def test_stage_order_requires_predecessor_and_handoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            with self.assertRaisesRegex(SystemExit, "predecessor idea-selection"):
                module.transition(project, "01-vision", "start")
            self.pass_idea_selection(project)
            self.assertEqual(module.transition(project, "01-vision", "start"), "IN_PROGRESS")

    def test_pass_requires_real_output_and_creates_handoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.pass_idea_selection(project)
            module.transition(project, "01-vision", "start")
            module.transition(project, "01-vision", "review")
            with self.assertRaisesRegex(SystemExit, "QUALITY_GATE_BLOCKED"):
                module.transition(project, "01-vision", "pass", approved_by="human")
            (project / "docs" / "01-vision" / "OUTPUT.md").write_text("# Vision\n\nMission, vision, goals, principles, assumptions, and open questions.\n", encoding="utf-8")
            self.assertEqual(module.transition(project, "01-vision", "pass", approved_by="human"), "PASSED")
            handoff = project / ".project-alpha" / "handoffs" / "01-vision__to__02-problem-discovery.md"
            self.assertTrue(handoff.exists())
            self.assertIn("- Status: READY", handoff.read_text(encoding="utf-8"))

    def test_block_requires_reason_and_persists_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.pass_idea_selection(project)
            module.transition(project, "01-vision", "start")
            with self.assertRaisesRegex(SystemExit, "BLOCK_REASON_REQUIRED"):
                module.transition(project, "01-vision", "block")
            self.assertEqual(module.transition(project, "01-vision", "block", reason="missing evidence"), "BLOCKED")
            self.assertEqual(module.state_value(module.read_state(project), "blocked_reason"), "missing evidence")
            self.assertEqual(module.transition(project, "01-vision", "resume"), "IN_PROGRESS")

    def test_event_ids_are_unique(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.pass_idea_selection(project)
            module.transition(project, "01-vision", "start")
            events = [p.read_text(encoding="utf-8") for p in (project / ".project-alpha" / "history" / "events").glob("*.json")]
            ids = {line.split('"')[3] for text in events for line in text.splitlines() if '"event_id"' in line}
            self.assertEqual(len(ids), len(events))

    def test_global_audit_blocks_incomplete_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.assertEqual(module.audit(project), 2)
            self.assertEqual(module.state_value(module.read_state(project), "global_audit_status"), "BLOCKED")
            report = project / ".project-alpha" / "audit" / "global-audit.md"
            self.assertIn("idea-selection: status is NOT_STARTED", report.read_text(encoding="utf-8"))

    def test_global_audit_requires_approval_after_all_stages_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.pass_vision(project)
            for stage in module.STAGES[1:]:
                (project / "docs" / stage / "OUTPUT.md").write_text(f"# {stage}\n\nCompleted stage output.\n", encoding="utf-8")
                module.transition(project, stage, "start")
                module.transition(project, stage, "review")
                module.transition(project, stage, "pass", approved_by="human")
            self.assertEqual(module.audit(project), 1)
            self.assertEqual(module.state_value(module.read_state(project), "global_audit_status"), "READY")
            self.assertEqual(module.audit(project, approved_by="cto"), 0)
            self.assertEqual(module.state_value(module.read_state(project), "lifecycle"), "PRODUCTION_READY")

    def test_integrity_audit_blocks_incomplete_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            directory = project / "docs" / "evidence"
            directory.mkdir()
            (directory / "bad.md").write_text("# Evidence Record\n\nEvidence ID: E1\nCLAIM: A claim\nTYPE: FACT\n", encoding="utf-8")
            code, status, findings = integrity.run_integrity_audit(project)
            self.assertEqual((code, status), (2, "BLOCK"))
            self.assertTrue(any("missing SOURCE" in item for item in findings))

    def test_integrity_audit_blocks_orphan_high_risk_decision(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            directory = project / ".project-alpha" / "decisions"
            directory.mkdir()
            (directory / "D1.md").write_text("# Decision Record\n\nDecision ID: D1\nStage: 04-prd\nDecision: Choose X\nContext: Test\nChosen option: X\nRationale: Test\nEvidence: E404\nImpact: High\nReversibility: Low\nRisk: HIGH\nApproval required: no\nApproval status: pending\n", encoding="utf-8")
            code, status, findings = integrity.run_integrity_audit(project)
            self.assertEqual((code, status), (2, "BLOCK"))
            self.assertTrue(any("unknown evidence: E404" in item for item in findings))
            self.assertTrue(any("must require approval" in item for item in findings))

    def test_global_audit_includes_integrity_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            directory = project / "docs" / "evidence"
            directory.mkdir()
            (directory / "bad.md").write_text("# Evidence Record\n\nEvidence ID: E1\nCLAIM: Claim\nTYPE: FACT\n", encoding="utf-8")
            self.assertEqual(module.audit(project), 2)
            text = (project / ".project-alpha" / "audit" / "global-audit.md").read_text(encoding="utf-8")
            self.assertIn("Integrity audit: BLOCK", text)
            self.assertIn("integrity: evidence E1 missing SOURCE", text)


if __name__ == "__main__":
    unittest.main()
