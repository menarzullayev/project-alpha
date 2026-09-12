import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("project_alpha", ROOT / "cli" / "project_alpha.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProjectAlphaCLITests(unittest.TestCase):
    def make_project(self, tmp: str) -> Path:
        project = Path(tmp) / "demo"
        args = type("Args", (), {
            "path": str(project), "name": "Demo", "repository": "acme/demo",
            "idea": "Test idea", "force": False,
        })()
        self.assertEqual(module.init(args), 0)
        return project

    def test_init_creates_layered_runtime_state_and_event_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.assertTrue((project / ".project-alpha" / "project-state.md").exists())
            self.assertTrue((project / ".project-alpha" / "state.json").exists())
            events = list((project / ".project-alpha" / "history" / "events").glob("*.json"))
            self.assertEqual(len(events), 1)
            self.assertTrue((project / "docs" / "01-vision" / "STAGE.md").exists())
            self.assertTrue((project / "docs" / "10-operations" / "OUTPUT.md").exists())

    def test_fresh_project_validates_with_warnings_not_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            self.assertEqual(module.validate(project), 0)

    def test_stage_lifecycle_requires_review_and_human_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            with self.assertRaises(SystemExit):
                module.transition(project, "01-vision", "pass")
            self.assertEqual(module.transition(project, "01-vision", "start"), "IN_PROGRESS")
            self.assertEqual(module.transition(project, "01-vision", "review"), "REVIEW")
            self.assertEqual(module.transition(project, "01-vision", "pass", approved_by="human"), "PASSED")
            state = module.read_state(project)
            self.assertEqual(module.state_value(state, "- 01-vision"), "PASSED")
            self.assertEqual(module.state_value(state, "current_stage"), "02-problem-discovery")
            events = list((project / ".project-alpha" / "history" / "events").glob("*.json"))
            self.assertEqual(len(events), 5)

    def test_block_and_resume_are_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = self.make_project(tmp)
            module.transition(project, "01-vision", "start")
            self.assertEqual(module.transition(project, "01-vision", "block", reason="missing evidence"), "BLOCKED")
            self.assertEqual(module.transition(project, "01-vision", "resume"), "IN_PROGRESS")
            state = module.read_state(project)
            self.assertEqual(module.state_value(state, "- 01-vision"), "IN_PROGRESS")
            events = list((project / ".project-alpha" / "history" / "events").glob("*.json"))
            self.assertEqual(len(events), 4)


if __name__ == "__main__":
    unittest.main()
