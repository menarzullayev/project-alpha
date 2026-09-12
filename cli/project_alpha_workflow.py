from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path

STAGES = [
    "idea-selection", "01-vision", "02-problem-discovery", "03-market-research",
    "04-prd", "05-domain-model", "06-architecture", "07-adr",
    "08-technical-spec", "09-development-plan", "10-operations",
]
HIGH_IMPACT = {"idea-selection", "01-vision", "04-prd", "06-architecture", "07-adr", "08-technical-spec", "10-operations"}
ALLOWED = {"NOT_STARTED", "IN_PROGRESS", "REVIEW", "PASSED", "BLOCKED"}


def state_path(project: Path) -> Path:
    return project / ".project-alpha" / "project-state.md"


def load(project: Path) -> str:
    p = state_path(project)
    if not p.exists():
        raise SystemExit("Not a Project Alpha project")
    return p.read_text(encoding="utf-8")


def get_stage(state: str, stage: str) -> str:
    m = re.search(rf"^- {re.escape(stage)}:\s*(\S+)", state, re.MULTILINE)
    return m.group(1) if m else "NOT_STARTED"


def set_stage(state: str, stage: str, status: str) -> str:
    return re.sub(rf"^- {re.escape(stage)}:\s*\S+", f"- {stage}: {status}", state, count=1, flags=re.MULTILINE)


def set_current(state: str, stage: str, lifecycle: str) -> str:
    state = re.sub(r"^current_stage:\s*.*$", f"current_stage: {stage}", state, count=1, flags=re.MULTILINE)
    return re.sub(r"^lifecycle:\s*.*$", f"lifecycle: {lifecycle}", state, count=1, flags=re.MULTILINE)


def save(project: Path, state: str) -> None:
    state_path(project).write_text(state, encoding="utf-8")


def append_history(project: Path, text: str) -> None:
    p = project / ".project-alpha" / "history.md"
    with p.open("a", encoding="utf-8") as f:
        f.write(f"- {dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()} — {text}\n")


def main() -> int:
    parser = argparse.ArgumentParser(prog="project-alpha-workflow")
    parser.add_argument("stage", choices=STAGES)
    parser.add_argument("action", choices=["start", "review", "pass", "block", "unblock"])
    parser.add_argument("--approved-by")
    parser.add_argument("--reason")
    parser.add_argument("path", nargs="?", default=".")
    args = parser.parse_args()
    project = Path(args.path).resolve()
    state = load(project)
    current = get_stage(state, args.stage)

    if args.action == "start":
        if current not in {"NOT_STARTED", "BLOCKED"}:
            raise SystemExit(f"Cannot start {args.stage} from {current}")
        state = set_stage(state, args.stage, "IN_PROGRESS")
        state = set_current(state, args.stage, "IN_PROGRESS")
        append_history(project, f"{args.stage} started")

    elif args.action == "review":
        if current != "IN_PROGRESS":
            raise SystemExit(f"Cannot review {args.stage} from {current}")
        state = set_stage(state, args.stage, "REVIEW")
        state = set_current(state, args.stage, "REVIEW")
        append_history(project, f"{args.stage} moved to REVIEW")

    elif args.action == "pass":
        if current != "REVIEW":
            raise SystemExit(f"Cannot pass {args.stage} from {current}; stage must be in REVIEW")
        if args.stage in HIGH_IMPACT and not args.approved_by:
            raise SystemExit(f"HUMAN_APPROVAL_REQUIRED: --approved-by is required for {args.stage}")
        state = set_stage(state, args.stage, "PASSED")
        next_stage = STAGES[STAGES.index(args.stage) + 1] if args.stage != STAGES[-1] else "GLOBAL_AUDIT"
        state = set_current(state, next_stage, "NOT_STARTED" if next_stage != "GLOBAL_AUDIT" else "REVIEW")
        append_history(project, f"{args.stage} PASSED" + (f"; approved by {args.approved_by}" if args.approved_by else ""))
        if args.approved_by:
            approval = project / ".project-alpha" / "approval-record.md"
            with approval.open("a", encoding="utf-8") as f:
                f.write(f"\n## Approval — {args.stage}\n- Decision: PASS\n- Approver: {args.approved_by}\n- Timestamp: {dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()}\n- Reason: {args.reason or 'Quality gate passed'}\n")

    elif args.action == "block":
        state = set_stage(state, args.stage, "BLOCKED")
        state = set_current(state, args.stage, "BLOCKED")
        append_history(project, f"{args.stage} BLOCKED: {args.reason or 'no reason supplied'}")

    else:  # unblock
        if current != "BLOCKED":
            raise SystemExit(f"Cannot unblock {args.stage} from {current}")
        state = set_stage(state, args.stage, "IN_PROGRESS")
        state = set_current(state, args.stage, "IN_PROGRESS")
        append_history(project, f"{args.stage} unblocked")

    save(project, state)
    print(f"{args.stage}: {get_stage(state, args.stage)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
