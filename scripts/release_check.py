from pathlib import Path
import configparser,re,sys
root=Path(__file__).resolve().parents[1]
errors=[]
version=(root/"VERSION").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"\d+\.\d+\.\d+",version): errors.append("VERSION must use semver")
py=(root/"pyproject.toml").read_text(encoding="utf-8")
if f'version = "{version}"' not in py: errors.append("pyproject version differs from VERSION")
required=["AGENTS.md","CLAUDE.md","MIGRATIONS.md","README.md","VERSION","pyproject.toml","FINAL-AUDIT.md","COMPLETION.md","RELEASE.md","docs/COMPLETION-INDEX.md","docs/APPROVAL.md","scripts/audit_evidence_check.py","cli/project_alpha.py","cli/project_alpha_workflow.py","cli/project_alpha_audit.py","cli/project_alpha_integrity.py","cli/project_alpha_semantic.py","cli/project_alpha_schema.py","cli/project_alpha_recovery.py","schema/1.0.0/project-state.schema.json","schema/1.0.0/record.schema.json"]
for item in required:
 if not (root/item).exists(): errors.append(f"missing release file: {item}")
if errors:
 print("RELEASE BLOCK"); [print(f"- {x}") for x in errors]; sys.exit(2)
print(f"RELEASE PASS {version}")
