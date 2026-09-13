from __future__ import annotations
from pathlib import Path
from project_alpha_workflow import ALL_STAGES,handoff_path,output_ready
from project_alpha import VERSION,read_state,state_value,set_state_value,meta_dir,sync_runtime_state,now
from project_alpha_integrity import run_integrity_audit
from project_alpha_semantic import run_semantic_audit
from project_alpha_schema import run_schema_audit
from project_alpha_recovery import run_recovery_audit

def run_global_audit(project:Path,approved_by:str|None=None):
 state=read_state(project); findings=[]; framework=state_value(state,"framework_version")
 if framework!=VERSION: findings.append(f"framework_version mismatch: {framework} != {VERSION}")
 if state_value(state,"blocked_stage") or state_value(state,"blocked_reason"): findings.append("project contains an active blocker")
 for i,stage in enumerate(ALL_STAGES):
  status=state_value(state,f"- {stage}","NOT_STARTED")
  if status!="PASSED": findings.append(f"{stage}: status is {status}, expected PASSED")
  ready,reason=output_ready(project,stage)
  if not ready: findings.append(f"{stage}: {reason}")
  if i<len(ALL_STAGES)-1:
   h=handoff_path(project,stage,ALL_STAGES[i+1])
   if not h.exists(): findings.append(f"missing handoff: {h.relative_to(project)}")
   elif "- Status: READY" not in h.read_text(encoding="utf-8"): findings.append(f"handoff is not READY: {h.relative_to(project)}")
 recovery_code,recovery_status,recovery_findings=run_recovery_audit(project)
 if recovery_code: findings.extend(f"recovery: {x}" for x in recovery_findings)
 schema_code,schema_status,schema_findings=run_schema_audit(project)
 if schema_code: findings.extend(f"schema: {x}" for x in schema_findings)
 integrity_code,integrity_status,integrity_findings=run_integrity_audit(project)
 if integrity_code: findings.extend(f"integrity: {x}" for x in integrity_findings)
 semantic_code,semantic_status,semantic_findings=run_semantic_audit(project)
 if semantic_code: findings.extend(f"semantic: {x}" for x in semantic_findings)
 d=meta_dir(project)/"audit"; d.mkdir(parents=True,exist_ok=True); status,code=("BLOCKED",2) if findings else (("READY",1) if not approved_by else ("APPROVED",0))
 state=set_state_value(state,"global_audit_status",status); state=set_state_value(state,"current_stage","GLOBAL_AUDIT"); state=set_state_value(state,"lifecycle","PRODUCTION_READY" if status=="APPROVED" else ("BLOCKED" if status=="BLOCKED" else "REVIEW")); (meta_dir(project)/"project-state.md").write_text(state,encoding="utf-8"); sync_runtime_state(project,state)
 lines=["# Global Audit","",f"- Framework version: {framework}",f"- Executed at: {now()}",f"- Status: {status}",f"- Recovery audit: {recovery_status}",f"- Schema audit: {schema_status}",f"- Integrity audit: {integrity_status}",f"- Semantic audit: {semantic_status}",""]
 if approved_by: lines.append(f"- Approver: {approved_by}")
 lines += ["## Findings"]+([f"- BLOCK: {x}" for x in findings] if findings else ["- None"])+["","## Gate"]
 lines.append("Global checks passed and human approval is recorded; project is Production Ready." if status=="APPROVED" else "Global checks passed; explicit human approval is required before Production Ready." if status=="READY" else "Resolve all findings and rerun the global audit.")
 (d/"global-audit.md").write_text("\n".join(lines)+"\n",encoding="utf-8"); return code,status
