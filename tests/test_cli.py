import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("project_alpha", ROOT / "cli" / "project_alpha.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProjectAlphaCLITests(unittest.TestCase):
    def test_init_creates_framework_contracts(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "demo"
            args = type(
                "Args",
                (),
                {
                    "path": str(project),
                    "name": "Demo",
                    "repository": "acme/demo",
                    "idea": "Test idea",
                    "force": False,
                },
            )()
            self.assertEqual(module.init(args), 0)
            self.assertTrue((project / ".project-alpha" / "project-state.md").exists())
            self.assertTrue((project / "docs" / "01-vision" / "STAGE.md").exists())
            self.assertTrue((project / "docs" / "10-operations" / "OUTPUT.md").exists())

    def test_fresh_project_validates_with_warnings_not_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "demo"
            args = type(
                "Args",
                (),
                {
                    "path": str(project),
                    "name": "Demo",
                    "repository": "",
                    "idea": "",
                    "force": False,
                },
            )()
            module.init(args)
            self.assertEqual(module.validate(project), 0)


if __name__ == "__main__":
    unittest.main()
