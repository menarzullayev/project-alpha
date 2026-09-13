from __future__ import annotations

from pathlib import Path

from project_alpha_workflow import ALL_STAGES, handoff_path, output_ready
from project_alpha import VERSION, read_state, state_value, set_state_value, meta_dir, sync_runtime_state, now

AUDIT_STATUSES = {"NOT_RUN", "READY", "BLOCKED", "APPROVED"}


def run_global_audit(project: Path, approved_by: str | None = None) -> tuple[int, str]:
    state = read_state(project)
    findings: list[str] = []
    framework = state_value(state, "framework_version")
    if framework != VERSION:
        findings.append(f"framework_version mismatch: {framework} != {VERSION}")
    if state_value(state, "blocked_stage") or state_value(state, "blocked_reason"):
        findings.append("project contains an active blocker")

    for index, stage in enumerate(ALL_STAGES):
        status = state_value(state, f"- {stage}", "NOT_STARTED")
        if status != "PASSED":
            findings.append(f"{stage}: status is {status}, expected PASSED")
        ready, reason = output_ready(project, stage)
        if not ready:
            findings.append(f"{stage}: {reason}")
        if index < len(ALL_STAGES) - 1:
            next_stage = ALL_STAGES[index + 1]
            handoff = handoff_path(project, stage, next_stage)
            if not handoff.exists():
                findings.append(f"missing handoff: {handoff.relative_to(project)}")
            elif "- Status: READY" not in handoff.read_text(encoding="utf-8"):
                findings.append(f"handoff is not READY: {handoff.relative_to(project)}")

    audit_dir = meta_dir(project) / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    report = audit_dir / "global-audit.md"

    if findings:
        status = "BLOCKED"
        exit_code = 2
    elif not approved_by:
        status = "READY"
        exit_code = 1
    else:
        status = "APPROVED"
        exit_code = 0

    state = set_state_value(state, "global_audit_status", status)
    state = set_state_value(state, "current_stage", "GLOBAL_AUDIT")
    state = set_state_value(state, "lifecycle", "PRODUCTION_READY" if status == "APPROVED" else ("BLOCKED" if status == "BLOCKED" else "REVIEW"))
    (meta_dir(project) / "project-state.md").write_text(state, encoding="utf-8")
    sync_runtime_state(project, state)

    lines = [
        "# Global Audit",
        "",
        f"- Framework version: {framework}",
        f"- Executed at: {now()}",
        f"- Status: {status}",
    ]
    if approved_by:
        lines += [f"- Approver: {approved_by}"]
    lines += ["", "## Findings"]
    lines += [f"- BLOCK: {item}" for item in findings] if findings else ["- None"]
    lines += ["", "## Gate"]
    if status == "READY":
        lines.append("Global consistency checks passed. Explicit human approval is required before Production Ready.")
    elif status == "APPROVED":
        lines.append("Global consistency checks passed and human approval was recorded. Project is Production Ready.")
    else:
        lines.append("Resolve all findings and rerun the global audit.")
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return exit_code, status
