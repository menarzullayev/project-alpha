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

OWNER_STAGE = {
    "PROB": "01-vision", "METRIC": "01-vision", "FEAT": "04-prd",
    "REQ": "04-prd", "DOM": "05-domain-model", "ADR": "07-adr",
    "NFR": "08-technical-spec", "EVID": "03-market-research", "DEC": "07-adr",
}

STAGE_RULES = {
    "02-problem-discovery": {"PROB": "01-vision", "METRIC": "01-vision"},
    "03-market-research": {"PROB": "02-problem-discovery"},
    "04-prd": {"PROB": "02-problem-discovery"},
    "05-domain-model": {"REQ": "04-prd"},
    "06-architecture": {"REQ": "04-prd"},
    "07-adr": {"REQ": "04-prd"},
    "08-technical-spec": {"REQ": "04-prd", "ADR": "07-adr"},
    "09-development-plan": {"REQ": "04-prd", "ADR": "07-adr"},
    "10-operations": {"REQ": "04-prd"},
}


def _ids(text: str) -> dict[str, set[str]]:
    return {kind: set(re.findall(rf"(?<![A-Za-z0-9_-]){pattern}(?![A-Za-z0-9_-])", text)) for kind, pattern in ID_PATTERNS.items()}


def _docs(project: Path) -> list[tuple[str, Path, str]]:
    result = []
    for stage in ALL_STAGES:
        path = project / "docs" / stage / "OUTPUT.md"
        if path.exists():
            result.append((stage, path, path.read_text(encoding="utf-8")))
    return result


def run_semantic_audit(project: Path) -> tuple[int, str, list[str]]:
    docs = _docs(project)
    refs_by_stage = {stage: _ids(text) for stage, _, text in docs}
    definitions: dict[str, list[tuple[str, Path]]] = {}
    findings: list[str] = []
    stage_index = {stage: index for index, stage in enumerate(ALL_STAGES)}

    for stage, path, _ in docs:
        for kind, values in refs_by_stage[stage].items():
            if OWNER_STAGE.get(kind) == stage:
                for value in sorted(values):
                    definitions.setdefault(value, []).append((stage, path))

    for value, owners in definitions.items():
        if len(owners) > 1:
            paths = " and ".join(str(path.relative_to(project)) for _, path in owners)
            findings.append(f"duplicate semantic ID {value}: {paths}")

    for stage, path, refs in refs_by_stage.items():
        for kind, values in refs.items():
            owner_stage = OWNER_STAGE.get(kind)
            for value in sorted(values):
                if owner_stage and stage_index[stage] < stage_index[owner_stage]:
                    findings.append(f"forward reference {value}: {path.relative_to(project)} references {kind} owned by later stage {owner_stage}")
                elif owner_stage and stage_index[stage] >= stage_index[owner_stage] and value not in definitions:
                    findings.append(f"unknown semantic reference {value}: {path.relative_to(project)}")

    for stage, requirements in STAGE_RULES.items():
        refs = refs_by_stage.get(stage, {})
        path = project / "docs" / stage / "OUTPUT.md"
        if not path.exists():
            continue
        for kind, upstream in requirements.items():
            current = refs.get(kind, set())
            upstream_ids = refs_by_stage.get(upstream, {}).get(kind, set())
            if current and not (current & upstream_ids):
                findings.append(f"traceability violation {stage}: {kind} IDs do not trace to {upstream}")
            elif not current:
                findings.append(f"traceability warning {stage}: no {kind}-* semantic IDs found for required link to {upstream}")

    report_dir = project / ".project-alpha" / "audit"
    report_dir.mkdir(parents=True, exist_ok=True)
    report = report_dir / "semantic-audit.md"
    blocked_prefixes = ("duplicate", "forward reference", "traceability violation")
    status = "BLOCKED" if any(item.startswith(blocked_prefixes) for item in findings) else "PASS"
    code = 2 if status == "BLOCKED" else 0
    lines = ["# Cross-Stage Semantic Consistency Audit", "", f"- Status: {status}", f"- Semantic IDs: {sum(len(v) for v in refs_by_stage.values() for v in v.values())}", "", "## Findings"]
    lines.extend(f"- {item}" for item in findings) if findings else lines.append("- None")
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return code, status, findings
