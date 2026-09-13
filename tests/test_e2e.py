import tempfile,unittest
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"cli"))
import project_alpha as cli
class EndToEndAcceptance(unittest.TestCase):
 def test_full_pipeline_reaches_global_audit_ready(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/"product"; a=type("Args",(),{"path":str(p),"name":"Acceptance","repository":"example/product","idea":"Test product","force":False})(); self.assertEqual(cli.init(a),0)
   for stage in cli.ALL_STAGES:
    (p/"docs"/stage/"OUTPUT.md").write_text(f"# {stage}\n\nAcceptance output for {stage}.\n",encoding="utf-8")
    cli.transition(p,stage,"start")
    cli.transition(p,stage,"review")
    cli.transition(p,stage,"pass",approved_by="acceptance-human")
   self.assertEqual(cli.audit(p),1)
   self.assertEqual(cli.state_value(cli.read_state(p),"global_audit_status"),"READY")
   self.assertEqual(cli.audit(p,approved_by="release-human"),0)
   self.assertEqual(cli.state_value(cli.read_state(p),"lifecycle"),"PRODUCTION_READY")
if __name__=="__main__": unittest.main()
