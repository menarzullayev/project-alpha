from __future__ import annotations
import json,re
from pathlib import Path
SCHEMA_VERSION="1.0.0"
STAGES=["idea-selection","01-vision","02-problem-discovery","03-market-research","04-prd","05-domain-model","06-architecture","07-adr","08-technical-spec","09-development-plan","10-operations"]
LIFECYCLES={"NOT_STARTED","IN_PROGRESS","REVIEW","PASSED","BLOCKED","PRODUCTION_READY"}
def _f(t,n):
 m=re.search(rf"^[-*]?\s*{re.escape(n)}:\s*([^\r\n]*)$",t,re.M|re.I); return m.group(1).strip() if m else ""
def run_schema_audit(project:Path):
 e=[]; p=project/".project-alpha"/"state.json"
 if not p.exists(): e.append("state: missing .project-alpha/state.json")
 else:
  try: d=json.loads(p.read_text(encoding="utf-8"))
  except json.JSONDecodeError as x: d={}; e.append(f"state: invalid JSON: {x}")
  for k in ("framework_version","current_stage","lifecycle","global_audit_status","stages","updated_at"):
   if k not in d: e.append(f"state: missing required property {k}")
  if d.get("framework_version")!=SCHEMA_VERSION: e.append(f"state: framework_version {d.get('framework_version')} != schema {SCHEMA_VERSION}")
  if d.get("current_stage") not in STAGES+["GLOBAL_AUDIT"]: e.append(f"state: invalid current_stage {d.get('current_stage')}")
  if d.get("lifecycle") not in LIFECYCLES: e.append(f"state: invalid lifecycle {d.get('lifecycle')}")
  if d.get("global_audit_status") not in {"NOT_RUN","READY","BLOCKED","APPROVED"}: e.append(f"state: invalid global_audit_status {d.get('global_audit_status')}")
  if not isinstance(d.get("stages"),dict): e.append("state: stages must be an object")
  else:
   for s in STAGES:
    if s not in d["stages"]: e.append(f"state: missing stage {s}")
    elif d["stages"][s] not in LIFECYCLES-{"PRODUCTION_READY"}: e.append(f"state: invalid status for {s}: {d['stages'][s]}")
 for directory,label,pattern,required in [(project/"docs"/"evidence","Evidence",r"EVID-[A-Za-z0-9][A-Za-z0-9._-]*",("CLAIM","SOURCE","DATE","CONFIDENCE","TYPE","RISK")),(project/".project-alpha"/"decisions","Decision",r"DEC-[A-Za-z0-9][A-Za-z0-9._-]*",("Stage","Decision","Context","Chosen option","Rationale","Impact","Reversibility","Risk","Approval required","Approval status")),(project/".project-alpha"/"approvals","Approval",r"APR-[A-Za-z0-9][A-Za-z0-9._-]*",("Stage","Decision ID","Status"))]:
  if directory.exists():
   seen=set()
   for p in directory.glob("*.md"):
    t=p.read_text(encoding="utf-8"); rid=_f(t,f"{label} ID") or p.stem
    if rid in seen: e.append(f"{label.lower()}: duplicate ID {rid}")
    seen.add(rid)
    if not re.fullmatch(pattern,rid): e.append(f"{label.lower()} {rid}: invalid ID format")
    for f in required:
     if not _f(t,f): e.append(f"{label.lower()} {rid}: missing {f}")
 d=project/".project-alpha"/"audit"; d.mkdir(parents=True,exist_ok=True); status="BLOCK" if e else "PASS"; lines=["# Machine-Readable Schema Audit","",f"- Schema version: {SCHEMA_VERSION}",f"- Status: {status}","","## Findings"]; lines += [f"- {x}" for x in e] if e else ["- None"]; (d/"schema-audit.md").write_text("\n".join(lines)+"\n",encoding="utf-8"); return (2 if e else 0,status,e)
