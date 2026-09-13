import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cli"))

from project_alpha_semantic import run_semantic_audit


class SemanticAuditTests(unittest.TestCase):
    def make_project(self, tmp: str) -> Path:
        project = Path(tmp) / "demo"
        (project / "docs").mkdir(parents=True)
        return project

    def write_output(self, project: Path, stage: str, text: str) -> None:
        path = project / "docs" / stage / "OUTPUT.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def test_clean_traceability_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.write_output(project, "01-vision", "PROB-A and METRIC-A\n")
            self.write_output(project, "02-problem-discovery", "PROB-A METRIC-A\n")
            self.write_output(project, "03-market-research", "PROB-A\n")
            self.write_output(project, "04-prd", "PROB-A REQ-A\n")
            code, status, findings = run_semantic_audit(project)
            self.assertEqual((code, status), (0, "PASS"))
            self.assertEqual(findings, [])

    def test_forward_reference_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.write_output(project, "02-problem-discovery", "REQ-A\n")
            self.write_output(project, "04-prd", "REQ-A\n")
            code, status, findings = run_semantic_audit(project)
            self.assertEqual((code, status), (2, "BLOCKED"))
            self.assertTrue(any("forward reference REQ-A" in item for item in findings))

    def test_traceability_violation_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.write_output(project, "01-vision", "PROB-A\nMETRIC-A\n")
            self.write_output(project, "02-problem-discovery", "PROB-B METRIC-B\n")
            code, status, findings = run_semantic_audit(project)
            self.assertEqual((code, status), (2, "BLOCKED"))
            self.assertTrue(any("traceability violation 02-problem-discovery" in item for item in findings))

    def test_missing_ids_are_warnings_not_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.write_output(project, "01-vision", "Narrative only.\n")
            self.write_output(project, "02-problem-discovery", "Narrative only.\n")
            code, status, findings = run_semantic_audit(project)
            self.assertEqual((code, status), (0, "PASS"))
            self.assertTrue(any("traceability warning" in item for item in findings))

    def test_unknown_reference_is_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.write_output(project, "01-vision", "PROB-A\n")
            self.write_output(project, "02-problem-discovery", "PROB-A REQ-UNKNOWN\n")
            code, status, findings = run_semantic_audit(project)
            self.assertEqual((code, status), (0, "PASS"))
            self.assertTrue(any("unknown semantic reference REQ-UNKNOWN" in item for item in findings))


if __name__ == "__main__":
    unittest.main()
