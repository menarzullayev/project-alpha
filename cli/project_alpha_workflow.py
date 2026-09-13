from __future__ import annotations

import datetime as dt
import json
import re
import uuid
from pathlib import Path

PRE_PIPELINE = "idea-selection"
STAGES = [
    "01-vision", "02-problem-discovery", "03-market-research", "04-prd",
    "05-domain-model", "06-architecture", "07-adr", "08-technical-spec",
    "09-development-plan", "10-operations",
]
ALL_STAGES = [PRE_PIPELINE, *STAGES]
HIGH_IMPACT = {PRE_PIPELINE, "01-vision", "04-prd", "06-architecture", "07-adr", "08-technical-spec", "10-operations"}
ALLOWED = {"NOT_STARTED", "IN_PROGRESS", "REVIEW", "PASSED", "BLOCKED"}
EVENT_TYPES = {
    "stage.started", "stage.reviewed", "stage.passed", "stage.blocked", "stage.resumed",
    "decision.recorded", "approval.recorded", "evidence.recorded", "handoff.recorded",
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def meta_dir(project: Path) -> Path:
    return project / ".project-alpha"


def state_path(project: Path) -> Path:
    return meta_dir(project) / "project-state.md"


def load(project: Path) -> str:
    if not state_path(project).exists():
        raise SystemExit("Not a Project Alpha project")
    return state_path(project).read_text(encoding="utf-8")


def get_value(state: str, key: str, default: str = "") -> str:
    match = re.search(rf"^{re.escape(key)}:[ \t]*([^\r\n]*)$", state, re.MULTILINE)
    return match.group(1).strip() if match else default


def get_stage(state: str, stage: str) -> str:
    return get_value(state, f"- {stage}", "NOT_STARTED")


def set_value(state: str, key: str, value: str) -> str:
    pattern = rf"^{re.escape(key)}:[^\r\n]*$"
    if re.search(pattern, state, re.MULTILINE):
        return re.sub(pattern, f"{key}: {value}", state, count=1, flags=re.MULTILINE)
    return state.rstrip() + f"\n{key}: {value}\n"


def set_stage(state: str, stage: str, status: str) -> str:
    pattern = rf"^- {re.escape(stage)}:[^\r\n]*$"
    if not re.search(pattern, state, re.MULTILINE):
        raise SystemExit(f"Stage is not defined in project state: {stage}")
    return re.sub(pattern, f"- {stage}: {status}", state, count=1, flags=re.MULTILINE)


def save(project: Path, state: str) -> None:
    state_path(project).write_text(state, encoding="utf-8")
    runtime = {
        "framework_version": get_value(state, "framework_version"),
        "current_stage": get_value(state, "current_stage"),
        "lifecycle": get_value(state, "lifecycle"),
        "global_audit_status": get_value(state, "global_audit_status", "NOT_RUN"),
        "stages": {stage: get_stage(state, stage) for stage in ALL_STAGES},
        "updated_at": now(),
    }
    (meta_dir(project) / "state.json").write_text(json.dumps(runtime, indent=2) + "\n", encoding="utf-8")


def stage_output(project: Path, stage: str) -> Path:
    return project / "docs" / stage / "OUTPUT.md"


def output_ready(project: Path, stage: str) -> tuple[bool, str]:
    output = stage_output(project, stage)
    if not output.exists():
        return False, f"missing output: {output.relative_to(project)}"
    text = output.read_text(encoding="utf-8")
    template = output.with_name("TEMPLATE.md")
    if template.exists() and text.strip() == template.read_text(encoding="utf-8").strip():
        return False, f"OUTPUT.md is unchanged from TEMPLATE.md: {output.relative_to(project)}"
    if any(token in text for token in ("TODO", "TBD")) or "<fill" in text.lower():
        return False, f"placeholder content remains in {output.relative_to(project)}"
    return True, "ready"


def handoff_dir(project: Path) -> Path:
    directory = meta_dir(project) / "handoffs"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def handoff_path(project: Path, from_stage: str, to_stage: str) -> Path:
    return handoff_dir(project) / f"{from_stage}__to__{to_stage}.md"


def create_handoff(project: Path, from_stage: str, to_stage: str, framework_version: str, reason: str | None = None) -> Path:
    if from_stage not in ALL_STAGES or to_stage not in ALL_STAGES:
        raise SystemExit("Invalid handoff stage")
    path = handoff_path(project, from_stage, to_stage)
    reason_text = reason.strip() if reason and reason.strip() else "Predecessor quality gate passed"
    path.write_text(
        f"# Stage Handoff\n\n"
        f"- From stage: {from_stage}\n"
        f"- To stage: {to_stage}\n"
        f"- Framework version: {framework_version}\n"
        f"- Status: READY\n"
        f"- Source output: docs/{from_stage}/OUTPUT.md\n"
        f"- Produced at: {now()}\n"
        f"- Reason: {reason_text}\n\n"
        f"## Contract\n\n"
        f"The next stage may start only after this handoff exists and the source stage is PASSED.\n\n"
        f"## Required input\n\n"
        f"Read `docs/{from_stage}/OUTPUT.md` as the authoritative output of the previous stage.\n",
        encoding="utf-8",
    )
    return path


def require_predecessor(project: Path, state: str, stage: str) -> None:
    idx = ALL_STAGES.index(stage)
    if idx == 0:
        return
    previous = ALL_STAGES[idx - 1]
    previous_status = get_stage(state, previous)
    if previous_status != "PASSED":
        raise SystemExit(f"Cannot start {stage}: predecessor {previous} is {previous_status}, expected PASSED")
    path = handoff_path(project, previous, stage)
    if not path.exists():
        raise SystemExit(f"Cannot start {stage}: required handoff is missing: {path.relative_to(project)}")
    text = path.read_text(encoding="utf-8")
    if "- Status: READY" not in text:
        raise SystemExit(f"Cannot start {stage}: handoff is not READY")
    ready, reason = output_ready(project, previous)
    if not ready:
        raise SystemExit(f"Cannot start {stage}: predecessor output is not ready: {reason}")


def event(project: Path, event_type: str, **payload: object) -> Path:
    if event_type not in EVENT_TYPES:
        raise SystemExit(f"Unsupported event type: {event_type}")
    directory = meta_dir(project) / "history" / "events"
    directory.mkdir(parents=True, exist_ok=True)
    event_id = uuid.uuid4().hex[:12]
    record = {"event_id": event_id, "event_type": event_type, "timestamp": now(), **payload}
    path = directory / f"{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}-{event_id}-{event_type.replace('.', '-')}.json"
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def _safe_id(value: object, prefix: str) -> str:
    raw = str(value or "").strip()
    if raw:
        return raw
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


def _write_record(project: Path, directory: Path, record_id: str, title: str, fields: list[tuple[str, object]]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{record_id}.md"
    if path.exists():
        raise SystemExit(f"Record already exists: {path.relative_to(project)}")
    lines = [f"# {title}", "", f"- {title.split()[0]} ID: {record_id}"]
    for name, value in fields:
        if value is not None and str(value).strip() != "":
            lines.append(f"- {name}: {value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _required(payload: dict[str, object], names: tuple[str, ...]) -> None:
    missing = [name for name in names if not str(payload.get(name, "")).strip()]
    if missing:
        raise SystemExit("REQUIRED_FIELDS: " + ", ".join(missing))


def transition(project: Path, stage: str, action: str, approved_by: str | None = None, reason: str | None = None) -> str:
    if stage not in ALL_STAGES:
        raise SystemExit(f"Unknown stage: {stage}")
    state = load(project)
    current = get_stage(state, stage)
    if action == "start":
        if current not in {"NOT_STARTED", "BLOCKED"}:
            raise SystemExit(f"Cannot start {stage} from {current}")
        require_predecessor(project, state, stage)
        new = "IN_PROGRESS"; event_type = "stage.started"
    elif action == "review":
        if current != "IN_PROGRESS":
            raise SystemExit(f"Cannot review {stage} from {current}")
        new = "REVIEW"; event_type = "stage.reviewed"
    elif action == "pass":
        if current != "REVIEW":
            raise SystemExit(f"Cannot pass {stage} from {current}; stage must be in REVIEW")
        ready, output_reason = output_ready(project, stage)
        if not ready:
            raise SystemExit(f"QUALITY_GATE_BLOCKED: {output_reason}")
        if stage in HIGH_IMPACT and not approved_by:
            raise SystemExit(f"HUMAN_APPROVAL_REQUIRED: --approved-by is required for {stage}")
        new = "PASSED"; event_type = "stage.passed"
    elif action == "block":
        if current not in ALLOWED - {"NOT_STARTED"}:
            raise SystemExit(f"Cannot block {stage} from {current}")
        if not reason or not reason.strip():
            raise SystemExit(f"BLOCK_REASON_REQUIRED: --reason is required for {stage}")
        new = "BLOCKED"; event_type = "stage.blocked"
    elif action in {"resume", "unblock"}:
        if current != "BLOCKED":
            raise SystemExit(f"Cannot resume {stage} from {current}")
        new = "IN_PROGRESS"; event_type = "stage.resumed"
    else:
        raise SystemExit(f"Unknown action: {action}")

    state = set_stage(state, stage, new)
    if action == "block":
        state = set_value(state, "blocked_stage", stage)
        state = set_value(state, "blocked_reason", reason.strip())
    elif action in {"resume", "unblock"}:
        state = set_value(state, "blocked_stage", "")
        state = set_value(state, "blocked_reason", "")
    if action == "pass":
        idx = ALL_STAGES.index(stage)
        next_stage = ALL_STAGES[idx + 1] if idx < len(ALL_STAGES) - 1 else "GLOBAL_AUDIT"
        state = set_value(state, "current_stage", next_stage)
        state = set_value(state, "lifecycle", "REVIEW" if next_stage == "GLOBAL_AUDIT" else "NOT_STARTED")
        handoff = None
        if next_stage != "GLOBAL_AUDIT":
            handoff = create_handoff(project, stage, next_stage, get_value(state, "framework_version"), reason)
    else:
        state = set_value(state, "current_stage", stage)
        state = set_value(state, "lifecycle", new)
        handoff = None
    save(project, state)
    event(project, event_type, stage=stage, from_status=current, to_status=new, reason=reason)
    if handoff is not None:
        event(project, "handoff.recorded", from_stage=stage, to_stage=next_stage, path=str(handoff.relative_to(project)), status="READY")
    if approved_by:
        event(project, "approval.recorded", stage=stage, decision="PASS", approver=approved_by, reason=reason or "Quality gate passed")
        approval = meta_dir(project) / "approval-record.md"
        with approval.open("a", encoding="utf-8") as f:
            f.write(f"\n## Approval — {stage}\n- Decision: PASS\n- Approver: {approved_by}\n- Timestamp: {now()}\n- Reason: {reason or 'Quality gate passed'}\n")
    return new


def record(project: Path, kind: str, payload: dict[str, object]) -> Path:
    mapping = {"decision": "decision.recorded", "approval": "approval.recorded", "evidence": "evidence.recorded", "handoff": "handoff.recorded"}
    if kind not in mapping:
        raise SystemExit(f"Unknown record kind: {kind}")

    if kind == "evidence":
        _required(payload, ("claim", "source", "date", "confidence", "type", "risk"))
        evidence_id = _safe_id(payload.get("evidence_id"), "EVID")
        path = _write_record(project, project / "docs" / "evidence", evidence_id, "Evidence Record", [
            ("CLAIM", payload.get("claim")), ("SOURCE", payload.get("source")), ("DATE", payload.get("date")),
            ("CONFIDENCE", str(payload.get("confidence", "")).upper()), ("TYPE", str(payload.get("type", "")).upper()),
            ("RISK", str(payload.get("risk", "")).upper()), ("Stage", payload.get("stage")),
        ])
    elif kind == "decision":
        _required(payload, ("stage", "title", "decision", "context", "chosen_option", "rationale", "impact", "reversibility", "risk", "evidence", "approval_required", "approval_status"))
        decision_id = _safe_id(payload.get("decision_id"), "DEC")
        path = _write_record(project, meta_dir(project) / "decisions", decision_id, "Decision Record", [
            ("Stage", payload.get("stage")), ("Title", payload.get("title")), ("Decision", payload.get("decision")),
            ("Context", payload.get("context")), ("Chosen option", payload.get("chosen_option")), ("Rationale", payload.get("rationale")),
            ("Impact", payload.get("impact")), ("Reversibility", payload.get("reversibility")), ("Risk", str(payload.get("risk", "")).upper()),
            ("Evidence", payload.get("evidence")), ("Approval required", str(payload.get("approval_required", "")).lower()),
            ("Approval status", str(payload.get("approval_status", "")).lower()), ("Approval ID", payload.get("approval_id")),
        ])
    elif kind == "approval":
        _required(payload, ("stage", "decision_id", "status"))
        approval_id = _safe_id(payload.get("approval_id"), "APR")
        status = str(payload.get("status", "")).lower()
        if status == "approved":
            _required(payload, ("approver",))
        path = _write_record(project, meta_dir(project) / "approvals", approval_id, "Approval Record", [
            ("Stage", payload.get("stage")), ("Decision", payload.get("decision")), ("Status", status),
            ("Decision ID", payload.get("decision_id")), ("Evidence", payload.get("evidence")),
            ("Approver", payload.get("approver")), ("Approved at", payload.get("approved_at") or (now() if status == "approved" else None)),
        ])
    else:
        if payload.get("from_stage") and payload.get("to_stage"):
            path = create_handoff(project, str(payload["from_stage"]), str(payload["to_stage"]), str(payload.get("framework_version", "1.0.0")), str(payload.get("reason", "")))
        else:
            return event(project, mapping[kind], **payload)

    event(project, mapping[kind], path=str(path.relative_to(project)), **payload)
    return path
