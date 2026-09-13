from __future__ import annotations
import json
from pathlib import Path
from project_alpha_workflow import ALL_STAGES
from project_alpha import state_value,read_state,meta_dir
EVENT_TO_STATUS={"stage.started":"IN_PROGRESS","stage.reviewed":"REVIEW","stage.passed":"PASSED","stage.blocked":"BLOCKED","stage.resumed":"IN_PROGRESS"}
def reconcile(project:Path):
 state=read_state(project); errors=[]; rp=meta_dir(project)/"state.json"
 if not rp.exists(): return ["runtime state missing"]
 try: runtime=json.loads(rp.read_text(encoding="utf-8"))
 except json.JSONDecodeError as e: return [f"runtime state invalid JSON: {e}"]
 for key in ("framework_version","current_stage","lifecycle","global_audit_status"):
  if runtime.get(key)!=state_value(state,key,"NOT_RUN" if key=="global_audit_status" else ""): errors.append(f"runtime {key} differs from Markdown state")
 for stage in ALL_STAGES:
  if runtime.get("stages",{}).get(stage)!=state_value(state,f"- {stage}","NOT_STARTED"): errors.append(f"runtime stage mismatch: {stage}")
 events=meta_dir(project)/"history"/"events"; latest={}
 if events.exists():
  for p in sorted(events.glob("*.json")):
   try: e=json.loads(p.read_text(encoding="utf-8"))
   except json.JSONDecodeError: errors.append(f"invalid event JSON: {p.relative_to(project)}"); continue
   if e.get("event_type") in EVENT_TO_STATUS and e.get("stage") in ALL_STAGES: latest[e["stage"]]=EVENT_TO_STATUS[e["event_type"]]
 for stage,status in latest.items():
  actual=state_value(state,f"- {stage}","NOT_STARTED")
  if status!=actual and not(status=="IN_PROGRESS" and actual=="REVIEW"): errors.append(f"history/state mismatch: {stage} history={status} state={actual}")
 return errors
def run_recovery_audit(project:Path):
 errors=reconcile(project); d=meta_dir(project)/"audit"; d.mkdir(parents=True,exist_ok=True); status="BLOCK" if errors else "PASS"; (d/"recovery-audit.md").write_text("# Deterministic Recovery Audit\n\n- Status: "+status+"\n\n## Findings\n\n"+("\n".join(f"- {x}" for x in errors) if errors else "- None")+"\n",encoding="utf-8"); return (2 if errors else 0,status,errors)
