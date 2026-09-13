import json,tempfile,unittest
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"cli"))
from project_alpha import init
from project_alpha_schema import run_schema_audit
class SchemaAuditTests(unittest.TestCase):
 def make_project(self,tmp):
  p=Path(tmp)/"demo"; a=type("Args",(),{"path":str(p),"name":"Demo","repository":"acme/demo","idea":"Test","force":False})(); self.assertEqual(init(a),0); return p
 def test_initialized_project_passes(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.make_project(t); self.assertEqual(run_schema_audit(p)[:2],(0,"PASS"))
 def test_corrupt_runtime_state_blocks(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.make_project(t); q=p/".project-alpha"/"state.json"; d=json.loads(q.read_text()); d["lifecycle"]="BROKEN"; q.write_text(json.dumps(d)); code,status,findings=run_schema_audit(p); self.assertEqual((code,status),(2,"BLOCK")); self.assertTrue(any("invalid lifecycle" in x for x in findings))
if __name__=="__main__": unittest.main()
