import tempfile,unittest,json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"cli"))
from project_alpha import init
from project_alpha_recovery import run_recovery_audit
class RecoveryTests(unittest.TestCase):
 def test_initialized_project_reconciles(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/"demo"; a=type("Args",(),{"path":str(p),"name":"Demo","repository":"","idea":"Test","force":False})(); init(a); self.assertEqual(run_recovery_audit(p)[:2],(0,"PASS"))
 def test_runtime_drift_blocks(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/"demo"; a=type("Args",(),{"path":str(p),"name":"Demo","repository":"","idea":"Test","force":False})(); init(a); q=p/".project-alpha"/"state.json"; d=json.loads(q.read_text()); d["lifecycle"]="BLOCKED"; q.write_text(json.dumps(d)); code,status,findings=run_recovery_audit(p); self.assertEqual((code,status),(2,"BLOCK")); self.assertTrue(findings)
if __name__=="__main__": unittest.main()
