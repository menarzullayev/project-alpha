import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("project_alpha", ROOT / "cli" / "project_alpha.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_init_creates_framework_contracts():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "demo"
        args = type("Args", (), {"path": str(project), "name": "Demo", "repository": "acme/demo", "idea": "Test idea", "force": False})()
        assert module.init(args) == 0
        assert (project / ".project-alpha" / "project-state.md").exists()
        assert (project / "docs" / "01-vision" / "STAGE.md").exists()
        assert (project / "docs" / "10-operations" / "OUTPUT.md").exists()


def test_fresh_project_validates_with_warnings_not_errors():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "demo"
        args = type("Args", (), {"path": str(project), "name": "Demo", "repository": "", "idea": "", "force": False})()
        module.init(args)
        assert module.validate(project) == 0
