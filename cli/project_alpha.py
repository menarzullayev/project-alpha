from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
from pathlib import Path

try:
    from project_alpha_workflow import ALL_STAGES, PRE_PIPELINE, STAGES, record, transition
except ImportError:
    from .project_alpha_workflow import ALL_STAGES, PRE_PIPELINE, STAGES, record, transition

VERSION = "1.0.0"
LIFECYCLE = {"NOT_STARTED", "IN_PROGRESS", "REVIEW", "PASSED", "BLOCKED", "PRODUCTION_READY"}


def framework_root() -> Path:
    return Path(__file__).resolve().parents[1]


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def meta_dir(project: Path) -> Path:
    return project / ".project-alpha"


def stage_dir(project: Path, stage: str) -> Path:
    return project / "docs" / stage


def read_state(project: Path) -> str:
    path = meta_dir(project) / "project-state.md"
    if not path.exists():
        raise SystemExit("Not a Project Alpha project: .project-alpha/project-state.md is missing")
    return path.read_text(encoding="utf-8")


def state_value(state: str, key: str, default: str = "") -> str:
    match = re.search(rf"^{re.escape(key)}:[ \t]*([^\r\n]*)$", state, re.MULTILINE)
    return match.group(1).strip() if match else default


def set_state_value(state: str, key: str, value: str) -> str:
    pattern = rf"^{re.escape(key)}:[^\r\n]*$"
    if re.search(pattern, state, re.MULTILINE):
        return re.sub(pattern, f"{key}: {value}", state, count=1, flags=re.MULTILINE)
    return state.rstrip() + f"\n{key}: {value}\n"


def sync_runtime_state(project: Path, state: str) -> None:
    data = {
        "framework_version": state_value(state, "framework_version", VERSION),
        "current_stage": state_value(state, "current_stage"),
        "lifecycle": state_value(state, "lifecycle"),
        "global_audit_status": state_value(state, "global_audit_status", "NOT_RUN"),
        "stages": {stage: state_value(state, f"- {stage}", "NOT_STARTED") for stage in ALL_STAGES},
        "updated_at": now(),
    }
    (meta_dir(project) / "state.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def init(args: argparse.Namespace) -> int:
    project = Path(args.path).resolve()
    if project.exists() and any(project.iterdir()) and not args.force:
        raise SystemExit(f"Target is not empty: {project}. Use --force to initialize anyway.")
    project.mkdir(parents=True, exist_ok=True)
    root = framework_root()
    for stage in ALL_STAGES:
        source = root / "docs" / stage
        target = stage_dir(project, stage)
        target.mkdir(parents=True, exist_ok=True)
        for name in ("README.md", "STAGE.md", "TEMPLATE.md", "QUALITY-GATE.md"):
            if (source / name).exists():
                shutil.copy2(source / name, target / name)
        if (target / "TEMPLATE.md").exists():
            shutil.copy2(target / "TEMPLATE.md", target / "OUTPUT.md")

    meta = meta_dir(project)
    meta.mkdir(exist_ok=True)
    config = (root / "templates" / "project-config.md").read_text(encoding="utf-8")
    replacements = {
        "- Project name:": f"- Project name: {args.name or project.name}",
        "- Repository:": f"- Repository: {args.repository or ''}",
        "- Framework version:": f"- Framework version: {VERSION}",
        "- Created at:": f"- Created at: {now()}",
        "- One-line idea:": f"- One-line idea: {args.idea or ''}",
    }
    for old, new in replacements.items():
        config = config.replace(old, new)
    (meta / "project-config.md").write_text(config, encoding="utf-8")

    state = (root / "templates" / "project-state.md").read_text(encoding="utf-8")
    state = set_state_value(state, "framework_version", VERSION)
    state = set_state_value(state, "current_stage", PRE_PIPELINE)
    (meta / "project-state.md").write_text(state, encoding="utf-8")
    sync_runtime_state(project, state)
    for name in ("decision-log.md", "approval-record.md", "stage-contract.md"):
        shutil.copy2(root / "templates" / name, meta / name)
    (meta / "history.md").write_text(f"# Project Alpha History\n\n- {now()} — initialized with framework {VERSION}\n", encoding="utf-8")
    record(project, "handoff", {"action": "project.initialized", "framework_version": VERSION})
    print(f"Initialized Project Alpha {VERSION} at {project}")
    return 0


def validate(project: Path, semantic: bool = True) -> int:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        state = read_state(project)
    except SystemExit as exc:
        print(f"BLOCK: {exc}")
        return 2
    framework_version = state_value(state, "framework_version")
    if framework_version != VERSION:
        errors.append("framework_version does not match installed framework")
    lifecycle = state_value(state, "lifecycle")
    if lifecycle not in LIFECYCLE:
        errors.append(f"invalid lifecycle: {lifecycle}")
    current_stage = state_value(state, "current_stage")
    if current_stage not in ALL_STAGES and current_stage != "GLOBAL_AUDIT":
        errors.append(f"invalid current_stage: {current_stage}")

    for stage in ALL_STAGES:
        directory = stage_dir(project, stage)
        for name in ("STAGE.md", "TEMPLATE.md", "QUALITY-GATE.md", "OUTPUT.md"):
            if not (directory / name).exists():
                errors.append(f"missing {directory.relative_to(project)}/{name}")
        output = directory / "OUTPUT.md"
        if semantic and output.exists():
            text = output.read_text(encoding="utf-8")
            if "TODO" in text or "TBD" in text or "<fill" in text.lower():
                warnings.append(f"placeholder content remains in {output.relative_to(project)}")

    evidence = project / "docs" / "evidence"
    if evidence.exists():
        for path in evidence.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            for field in ("CLAIM", "SOURCE", "DATE", "CONFIDENCE", "TYPE"):
                if f"{field}:" not in text:
                    errors.append(f"evidence record missing {field}: {path.relative_to(project)}")

    if errors:
        print("BLOCK")
        for error in errors:
            print(f"- {error}")
        for warning in warnings:
            print(f"- WARN: {warning}")
        return 2
    print("PASS" if not warnings else "WARN")
    for warning in warnings:
        print(f"- {warning}")
    return 0


def status(project: Path) -> int:
    state = read_state(project)
    print(f"Framework: {state_value(state, 'framework_version')}")
    print(f"Current stage: {state_value(state, 'current_stage')}")
    print(f"Lifecycle: {state_value(state, 'lifecycle')}")
    print(f"Global audit: {state_value(state, 'global_audit_status', 'NOT_RUN')}")
    print("Stages:")
    for stage in ALL_STAGES:
        print(f"  {stage}: {state_value(state, f'- {stage}', 'NOT_STARTED')}")
    return 0


def audit(project: Path, approved_by: str | None = None) -> int:
    from project_alpha_audit import run_global_audit
    code, result = run_global_audit(project, approved_by)
    print(f"Global audit: {result}")
    return code


def migrate(args: argparse.Namespace) -> int:
    project = Path(args.path).resolve()
    state = read_state(project)
    current = state_value(state, "framework_version")
    target = args.to
    if target != VERSION:
        print(f"BLOCK: migration target {target} is not supported by framework {VERSION}")
        return 2
    if current == target:
        print(f"Already on framework {target}")
        return 0
    state = set_state_value(state, "framework_version", target)
    (meta_dir(project) / "project-state.md").write_text(state, encoding="utf-8")
    sync_runtime_state(project, state)
    with (meta_dir(project) / "history.md").open("a", encoding="utf-8") as history:
        history.write(f"- {now()} — migrated framework {current} → {target}; historical outputs preserved\n")
    record(project, "handoff", {"action": "framework.migrated", "from_version": current, "to_version": target})
    print(f"Migrated framework {current} → {target}")
    return 0


def workflow(args: argparse.Namespace) -> int:
    result = transition(Path(args.path).resolve(), args.stage, args.action, args.approved_by, args.reason)
    print(f"{args.stage}: {result}")
    return 0


def add_record(args: argparse.Namespace) -> int:
    payload = {key: value for key, value in vars(args).items() if key not in {"command", "path", "kind"} and value is not None}
    path = record(Path(args.path).resolve(), args.kind, payload)
    print(f"Recorded {args.kind}: {path.relative_to(Path(args.path).resolve())}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="project-alpha")
    sub = parser.add_subparsers(dest="command", required=True)

    init_parser = sub.add_parser("init")
    init_parser.add_argument("path", nargs="?", default=".")
    init_parser.add_argument("--name")
    init_parser.add_argument("--repository")
    init_parser.add_argument("--idea")
    init_parser.add_argument("--force", action="store_true")
    init_parser.set_defaults(func=init)

    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("path", nargs="?", default=".")
    validate_parser.add_argument("--structural-only", action="store_true")
    validate_parser.set_defaults(func=lambda args: validate(Path(args.path).resolve(), not args.structural_only))

    status_parser = sub.add_parser("status")
    status_parser.add_argument("path", nargs="?", default=".")
    status_parser.set_defaults(func=lambda args: status(Path(args.path).resolve()))

    audit_parser = sub.add_parser("audit")
    audit_parser.add_argument("path", nargs="?", default=".")
    audit_parser.add_argument("--approved-by")
    audit_parser.set_defaults(func=lambda args: audit(Path(args.path).resolve(), args.approved_by))

    migrate_parser = sub.add_parser("migrate")
    migrate_parser.add_argument("path", nargs="?", default=".")
    migrate_parser.add_argument("--to", required=True)
    migrate_parser.set_defaults(func=migrate)

    stage_parser = sub.add_parser("stage")
    stage_parser.add_argument("stage", choices=ALL_STAGES)
    stage_parser.add_argument("action", choices=["start", "review", "pass", "block", "resume", "unblock"])
    stage_parser.add_argument("path", nargs="?", default=".")
    stage_parser.add_argument("--approved-by")
    stage_parser.add_argument("--reason")
    stage_parser.set_defaults(func=workflow)

    for kind in ("decision", "approval", "evidence", "handoff"):
        command = sub.add_parser(kind)
        command.add_argument("path", nargs="?", default=".")
        command.add_argument("--stage")
        command.add_argument("--title")
        command.add_argument("--claim")
        command.add_argument("--source")
        command.add_argument("--date")
        command.add_argument("--confidence")
        command.add_argument("--type")
        command.add_argument("--decision")
        command.add_argument("--approver")
        command.add_argument("--reason")
        command.add_argument("--from-stage")
        command.add_argument("--to-stage")
        command.set_defaults(kind=kind, func=add_record)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
