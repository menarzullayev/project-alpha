from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

EVIDENCE_TYPES = {"FACT", "INFERENCE", "ASSUMPTION"}
CONFIDENCE = {"HIGH", "MEDIUM", "LOW"}
RISKS = {"LOW", "MEDIUM", "HIGH"}
STATUSES = {"pending", "approved", "rejected"}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def meta_dir(project: Path) -> Path:
    return project / ".project-alpha"


def field(text: str, name: str) -> str:
    match = re.search(rf"^[-*]?\s*{re.escape(name)}:\s*(.+?)\s*$", text, re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def references(value: str) -> list[str]:
    if not value or value.lower() in {"none", "n/a", "-"}:
        return []
    return [item.strip() for item in re.split(r"[,;\n]+", value) if item.strip()]


def validate_evidence(project: Path) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    ids: set[str] = set()
    directory = project / "docs" / "evidence"
    if not directory.exists():
        return errors, ids
    for path in sorted(directory.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        evidence_id = field(text, "Evidence ID") or path.stem
        if evidence_id in ids:
            errors.append(f"duplicate evidence ID: {evidence_id}")
        ids.add(evidence_id)
        values = {name: field(text, name) for name in ("CLAIM", "SOURCE", "DATE", "CONFIDENCE", "TYPE", "RISK")}
        for name, value in values.items():
            if not value:
                errors.append(f"evidence {evidence_id} missing {name}")
        kind, confidence, risk = values["TYPE"].upper(), values["CONFIDENCE"].upper(), values["RISK"].upper()
        if kind and kind not in EVIDENCE_TYPES:
            errors.append(f"evidence {evidence_id} has invalid TYPE: {kind}")
        if confidence and confidence not in CONFIDENCE:
            errors.append(f"evidence {evidence_id} has invalid CONFIDENCE: {confidence}")
        if risk and risk not in RISKS:
            errors.append(f"evidence {evidence_id} has invalid RISK: {risk}")
        if kind in {"FACT", "INFERENCE"} and values["SOURCE"].lower() in {"n/a", "none", "unknown"}:
            errors.append(f"evidence {evidence_id} requires a real SOURCE for {kind}")
        if confidence == "LOW" and risk == "HIGH":
            errors.append(f"evidence {evidence_id} cannot be HIGH risk with LOW confidence")
    return errors, ids


def validate_decisions(project: Path, evidence_ids: set[str]) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    ids: set[str] = set()
    directory = meta_dir(project) / "decisions"
    if not directory.exists():
        return errors, ids
    for path in sorted(directory.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        decision_id = field(text, "Decision ID") or path.stem
        if decision_id in ids:
            errors.append(f"duplicate decision ID: {decision_id}")
        ids.add(decision_id)
        values = {name: field(text, name) for name in ("Stage", "Decision", "Context", "Chosen option", "Rationale", "Impact", "Reversibility", "Risk", "Approval required", "Approval status")}
        for name, value in values.items():
            if not value:
                errors.append(f"decision {decision_id} missing {name}")
        risk = values["Risk"].upper()
        if risk and risk not in RISKS:
            errors.append(f"decision {decision_id} has invalid Risk: {risk}")
        evidence = references(field(text, "Evidence"))
        for ref in evidence:
            if ref not in evidence_ids:
                errors.append(f"decision {decision_id} references unknown evidence: {ref}")
        if risk == "HIGH" and values["Approval required"].lower() not in {"yes", "true"}:
            errors.append(f"decision {decision_id} must require approval because Risk is HIGH")
        if risk in {"HIGH", "MEDIUM"} and not evidence:
            errors.append(f"decision {decision_id} requires evidence because Risk is {risk}")
        status = values["Approval status"].lower()
        if status not in STATUSES:
            errors.append(f"decision {decision_id} has invalid Approval status: {status}")
        if status == "approved" and not field(text, "Approval ID"):
            errors.append(f"decision {decision_id} is approved but has no Approval ID")
    return errors, ids


def validate_approvals(project: Path, evidence_ids: set[str], decision_ids: set[str]) -> list[str]:
    errors: list[str] = []
    directory = meta_dir(project) / "approvals"
    if not directory.exists():
        return errors
    for path in sorted(directory.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        approval_id = field(text, "Approval ID") or path.stem
        values = {name: field(text, name) for name in ("Stage", "Decision", "Status", "Decision ID")}
        for name, value in values.items():
            if not value:
                errors.append(f"approval {approval_id} missing {name}")
        status = values["Status"].lower()
        if status not in STATUSES:
            errors.append(f"approval {approval_id} has invalid Status: {status}")
        if values["Decision ID"] and values["Decision ID"] not in decision_ids:
            errors.append(f"approval {approval_id} references unknown decision: {values['Decision ID']}")
        for ref in references(field(text, "Evidence")):
            if ref not in evidence_ids:
                errors.append(f"approval {approval_id} references unknown evidence: {ref}")
        if status == "approved":
            if not field(text, "Approver"):
                errors.append(f"approval {approval_id} is approved but has no Approver")
            if not field(text, "Approved at"):
                errors.append(f"approval {approval_id} is approved but has no Approved at timestamp")
    return errors


def run_integrity_audit(project: Path) -> tuple[int, str, list[str]]:
    evidence_errors, evidence_ids = validate_evidence(project)
    decision_errors, decision_ids = validate_decisions(project, evidence_ids)
    approval_errors = validate_approvals(project, evidence_ids, decision_ids)
    errors = evidence_errors + decision_errors + approval_errors
    report_dir = meta_dir(project) / "audit"
    report_dir.mkdir(parents=True, exist_ok=True)
    report = report_dir / "integrity-audit.md"
    lines = ["# Evidence & Decision Integrity Audit", "", f"- Run at: {now()}", f"- Evidence records: {len(evidence_ids)}", f"- Decision records: {len(decision_ids)}", "", "## Result", "", "PASS" if not errors else "BLOCK", ""]
    if errors:
        lines.extend(["## Findings", "", *[f"- {error}" for error in errors]])
    else:
        lines.append("No integrity violations found.")
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return (0 if not errors else 2, "PASS" if not errors else "BLOCK", errors)
