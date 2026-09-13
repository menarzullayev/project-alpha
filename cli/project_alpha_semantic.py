from __future__ import annotations

import re
from pathlib import Path

from project_alpha_workflow import ALL_STAGES

ID_PATTERNS = {
    "PROB": r"PROB-[A-Za-z0-9][A-Za-z0-9._-]*",
    "REQ": r"REQ-[A-Za-z0-9][A-Za-z0-9._-]*",
    "METRIC": r"METRIC-[A-Za-z0-9][A-Za-z0-9._-]*",
    "FEAT": r"FEAT-[A-Za-z0-9][A-Za-z0-9._-]*",
    "ADR": r"ADR-[A-Za-z0-9][A-Za-z0-9._-]*",
    "DOM": r"DOM-[A-Za-z0-9][A-Za-z0-9._-]*",
    "NFR": r"NFR-[A-Za-z0-9][A-Za-z0-9._-]*",
    "EVID": r"EVID-[A-Za-z0-9][A-Za-z0-9._-]*",
    "DEC": r"DEC-[A-Za-z0-9][A-Za-z0-9._-]*",
}

STAGE_RULES = {
    "02-problem-discovery": {"PROB": "01-vision", "METRIC": "01-vision"},
    "03-market-research": {"PROB": "02-problem-discovery"},
    "04-prd": {"PROB": "02-problem-discovery", "REQ": "04-prd"},
    "05-domain-model": {"REQ": "04-prd"},
    "06-architecture": {"REQ": "04-prd"},
    "07-adr": {"REQ": "04-prd", "ADR": "07-adr"},
    "08-technical-spec": {"REQ": "04-prd", "ADR": "07-adr"},
    "09-development-plan": {"REQ": "04-prd", "ADR": "07-adr"},
    "10-operations": {"REQ": "04-prd"},
}


def _ids(text: str) -> dict[str, set[str]]:
    return {kind: set(re.findall(rf"(?<![A-Za-z0-9_-]){pattern}(?![A-Za-z0-9_-])", text)) for kind, pattern in ID_PATTERNS.items()}


def _docs(project: Path) -> list[tuple[str, Path, str]]:
    result: list[tuple[str, Path, str]] = []
    for stage in ALL_STAGES:
        path = project / "docs" / stage / "OUTPUT.md"
        if path.exists():
            result.append((stage, path, path.read_text(encoding="utf-8")))
    return result


def run_semantic_audit(project: Path) -> tuple[int, str, list[str]]:
    docs = _docs(project)
    registry: dict[str, tuple[str, Path]] = {}
    refs_by_stage: dict[str, dict[str, set[str]]] = {}
    findings: list[str] = []
    stage_index = {stage: index for index, stage in enumerate(ALL_STAGES)}

    for stage, path, text in docs:
        refs_by_stage[stage] = _ids(text)
        for kind, values in refs_by_stage[stage].items():
            for value in sorted(values):
                if value in registry:
                    previous_stage, previous_path = registry[value]
                    findings.append(f"duplicate semantic ID {value}: {previous_path.relative_to(project)} and {path.relative_to(project)}")
                else:
                    registry[value] = (stage, path)

    for stage, path, refs in refs_by_stage.items():
        for kind, values in refs.items():
            for value in sorted(values):
                owner = registry.get(value)
                if owner and stage_index[owner[0]] > stage_index[stage]:
                    findings.append(f"forward reference {value}: {path.relative_to(project)} references later stage {owner[0]}")
                elif not owner:
                    findings.append(f"unknown semantic reference {value}: {path.relative_to(project)}")

    for stage, requirements in STAGE_RULES.items():
        refs = refs_by_stage.get(stage, {})
        path = project / "docs" / stage / "OUTPUT.md"
        if not path.exists():
            continue
        for kind, upstream in requirements.items():
            current = refs.get(kind, set())
            if kind == "REQ" and upstream == stage:
                continue
            upstream_ids = refs_by_stage.get(upstream, {}).get(kind, set())
            if current and not (current & upstream_ids):
                findings.append(f"traceability violation {stage}: {kind} IDs do not trace to {upstream}")
            if not current:
                findings.append(f"traceability warning {stage}: no {kind}-* semantic IDs found for required link to {upstream}")

    report_dir = project / ".project-alpha" / "audit"
    report_dir.mkdir(parents=True, exist_ok=True)
    report = report_dir / "semantic-audit.md"
    status = "BLOCKED" if any(item.startswith(("duplicate", "forward reference", "traceability violation")) for item in findings) else "PASS"
    code = 2 if status == "BLOCKED" else 0
    lines = ["# Cross-Stage Semantic Consistency Audit", "", f"- Status: {status}", f"- Semantic IDs: {len(registry)}", "", "## Findings"]
    lines.extend(f"- {item}" for item in findings) if findings else lines.append("- None")
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return code, status, findings
