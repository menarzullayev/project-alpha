from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
from pathlib import Path

VERSION = "1.0.0"
PRE_PIPELINE = "idea-selection"
STAGES = [
    "01-vision",
    "02-problem-discovery",
    "03-market-research",
    "04-prd",
    "05-domain-model",
    "06-architecture",
    "07-adr",
    "08-technical-spec",
    "09-development-plan",
    "10-operations",
]
ALL_STAGES = [PRE_PIPELINE, *STAGES]
LIFECYCLE = {"NOT_STARTED", "IN_PROGRESS", "REVIEW", "PASSED", "BLOCKED"}
RESULTS = {"PASS", "WARN", "BLOCK", "HUMAN_APPROVAL_REQUIRED"}


def framework_root() -> Path:
    return Path(__file__).resolve().parents[1]


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def stage_dir(project: Path, stage: str) -> Path:
    if stage == PRE_PIPELINE:
        return project / "docs" / PRE_PIPELINE
    return project / "docs" / stage


def output_path(project: Path, stage: str) -> Path:
    return stage_dir(project, stage) / "OUTPUT.md"


def read_state(project: Path) -> str:
    p = project / ".project-alpha" / "project-state.md"
    if not p.exists():
        raise SystemExit("Not a Project Alpha project: .project-alpha/project-state.md is missing")
    return p.read_text(encoding="utf-8")


def state_value(state: str, key: str, default: str = "") -> str:
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", state, re.MULTILINE)
    return m.group(1).strip() if m else default


def set_state_value(state: str, key: str, value: str) -> str:
    pattern = rf"^{re.escape(key)}:\s*.*$"
    replacement = f"{key}: {value}"
    if re.search(pattern, state, re.MULTILINE):
        return re.sub(pattern, replacement, state, count=1, flags=re.MULTILINE)
    return state.rstrip() + f"\n{replacement}\n"


def set_stage_status(state: str, stage: str, status: str) -> str:
    pattern = rf"^- {re.escape(stage)}:\s*.*$"
    replacement = f"- {stage}: {status}"
    if re.search(pattern, state, re.MULTILINE):
        return re.sub(pattern, replacement, state, count=1, flags=re.MULTILINE)
    return state.rstrip() + f"\n{replacement}\n"


def write_state(project: Path, state: str) -> None:
    (project / ".project-alpha" / "project-state.md").write_text(state, encoding="utf-8")


def init(args: argparse.Namespace) -> int:
    project = Path(args.path).resolve()
    if project.exists() and any(project.iterdir()) and not args.force:
        raise SystemExit(f"Target is not empty: {project}. Use --force to initialize anyway.")
    project.mkdir(parents=True, exist_ok=True)
    root = framework_root()

    for stage in ALL_STAGES:
        src = root / "docs" / stage
        dst = stage_dir(project, stage)
        dst.mkdir(parents=True, exist_ok=True)
        for name in ("README.md", "STAGE.md", "TEMPLATE.md", "QUALITY-GATE.md"):
            if (src / name).exists():
                shutil.copy2(src / name, dst / name)
        template = dst / "TEMPLATE.md"
        if template.exists():
            shutil.copy2(template, dst / "OUTPUT.md")

    meta = project / ".project-alpha"
    meta.mkdir(exist_ok=True)
    config = (root / "templates" / "project-config.md").read_text(encoding="utf-8")
    config = config.replace("- Project name:", f"- Project name: {args.name or project.name}")
    config = config.replace("- Repository:", f"- Repository: {args.repository or ''}")
    config = config.replace("- Framework version:", f"- Framework version: {VERSION}")
    config = config.replace("- Created at:", f"- Created at: {now()}")
    config = config.replace("- One-line idea:", f"- One-line idea: {args.idea or ''}")
    (meta / "project-config.md").write_text(config, encoding="utf-8")

    state = (root / "templates" / "project-state.md").read_text(encoding="utf-8")
    state = set_state_value(state, "framework_version", VERSION)
    state = set_state_value(state, "current_stage", "idea-selection")
    (meta / "project-state.md").write_text(state, encoding="utf-8")

    for template_name in ("decision-log.md", "approval-record.md", "stage-contract.md"):
        shutil.copy2(root / "templates" / template_name, meta / template_name)
    (meta / "history.md").write_text(
        f"# Project Alpha History\n\n- {now()} — initialized with framework {VERSION}\n", encoding="utf-8"
    )
    print(f"Initialized Project Alpha {VERSION} at {project}")
    return 0


def validate(project: Path, semantic: bool = True) -> int:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        state = read_state(project)
    except SystemExit as e:
        print(f"BLOCK: {e}")
        return 2

    if state_value(state, "framework_version") != VERSION:
        errors.append("framework_version does not match installed framework")
    lifecycle = state_value(state, "lifecycle")
    if lifecycle not in LIFECYCLE:
        errors.append(f"invalid lifecycle: {lifecycle}")

    for stage in ALL_STAGES:
        d = stage_dir(project, stage)
        for name in ("STAGE.md", "TEMPLATE.md", "QUALITY-GATE.md", "OUTPUT.md"):
            if not (d / name).exists():
                errors.append(f"missing {d.relative_to(project)}/{name}")
        out = output_path(project, stage)
        if out.exists():
            text = out.read_text(encoding="utf-8")
            if semantic:
                if "TODO" in text or "TBD" in text or "<fill" in text.lower():
                    warnings.append(f"placeholder content remains in {out.relative_to(project)}")

    # Evidence records are mandatory only for material claims; detect malformed explicit records.
    evidence = project / "docs" / "evidence"
    if evidence.exists():
        for p in evidence.glob("*.md"):
            text = p.read_text(encoding="utf-8")
            for field in ("CLAIM", "SOURCE", "DATE", "CONFIDENCE", "TYPE"):
                if f"{field}:" not in text:
                    errors.append(f"evidence record missing {field}: {p.relative_to(project)}")

    if errors:
        print("BLOCK")
        for e in errors:
            print(f"- {e}")
        if warnings:
            print("WARNINGS")
            for w in warnings:
                print(f"- {w}")
        return 2
    print("PASS" if not warnings else "WARN")
    for w in warnings:
        print(f"- {w}")
    return 0


def status(project: Path) -> int:
    state = read_state(project)
    print(f"Framework: {state_value(state, 'framework_version')}")
    print(f"Current stage: {state_value(state, 'current_stage')}")
    print(f"Lifecycle: {state_value(state, 'lifecycle')}")
    print("Stages:")
    for stage in ALL_STAGES:
        print(f"  {stage}: {state_value(state, '- ' + stage, 'UNKNOWN')}")
    return 0


def audit(project: Path) -> int:
    code = validate(project, semantic=True)
    if code == 2:
        print("Global audit: BLOCK")
        return code
    state = read_state(project)
    blocked: list[str] = []
    for stage in ALL_STAGES:
        status_match = re.search(rf"^- {re.escape(stage)}:\s*(\S+)", state, re.MULTILINE)
        if not status_match or status_match.group(1) != "PASSED":
            blocked.append(stage)
    if blocked:
        print("Global audit: HUMAN_APPROVAL_REQUIRED")
        print("Unpassed stages: " + ", ".join(blocked))
        return 1
    print("Global audit: PASS")
    return 0


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
    # 1.0.0 has no destructive historical migration. Only update the pin and append history.
    state = set_state_value(state, "framework_version", target)
    write_state(project, state)
    history = project / ".project-alpha" / "history.md"
    with history.open("a", encoding="utf-8") as f:
        f.write(f"- {now()} — migrated framework {current} → {target}; historical outputs preserved\n")
    print(f"Migrated framework {current} → {target}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="project-alpha")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="initialize a product repository")
    p.add_argument("path", nargs="?", default=".")
    p.add_argument("--name")
    p.add_argument("--repository")
    p.add_argument("--idea")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=init)

    for name, func in (("validate", validate), ("status", status), ("audit", audit)):
        p = sub.add_parser(name)
        p.add_argument("path", nargs="?", default=".")
        if name == "validate":
            p.add_argument("--structural-only", action="store_true")
            p.set_defaults(func=lambda a: func(Path(a.path).resolve(), not a.structural_only))
        else:
            p.set_defaults(func=lambda a, f=func: f(Path(a.path).resolve()))

    p = sub.add_parser("migrate")
    p.add_argument("path", nargs="?", default=".")
    p.add_argument("--to", required=True)
    p.set_defaults(func=migrate)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
