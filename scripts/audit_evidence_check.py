"""Verify that audit claims are backed by repository artifacts.

Reads the milestone tables in FINAL-AUDIT.md and docs/COMPLETION-INDEX.md.
Every row whose status is VERIFIED must cite at least one path that exists in
the repository. A row that cannot be parsed, or that cites no existing
artifact, is an ERROR - never a skip.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DOCS = ("FINAL-AUDIT.md", "docs/COMPLETION-INDEX.md")
STATUS_HEADER = "status"
EVIDENCE_HEADER = "evidence"
PATH_RE = re.compile(r"`([A-Za-z0-9_./-]+)`")
KNOWN_SUFFIXES = (".md", ".py", ".toml", ".yml", ".yaml", ".json")
VALID_STATUSES = ("VERIFIED", "OPEN")


def split_row(line):
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator(cells):
    return all(cell and set(cell) <= set("-: ") for cell in cells)


def cited(cell):
    found = []
    for match in PATH_RE.finditer(cell):
        token = match.group(1)
        if "/" in token or token.endswith(KNOWN_SUFFIXES):
            found.append(token)
    return found


def check_doc(rel, errors):
    doc = ROOT / rel
    if not doc.is_file():
        errors.append(f"{rel}: document missing")
        return 0, 0

    rows = 0
    verified = 0
    columns = None
    width = None

    for line in doc.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = split_row(line)
        if is_separator(cells):
            continue
        if columns is None:
            lowered = [cell.lower() for cell in cells]
            if STATUS_HEADER in lowered and EVIDENCE_HEADER in lowered:
                columns = (lowered.index(STATUS_HEADER), lowered.index(EVIDENCE_HEADER))
                width = len(cells)
            continue

        rows += 1
        if len(cells) != width:
            errors.append(
                f"{rel}: row has {len(cells)} cells, expected {width}: {line.strip()}"
            )
            continue

        status = cells[columns[0]].strip().strip("`*").upper()
        if status not in VALID_STATUSES:
            errors.append(
                f"{rel}: '{cells[0]}' has unrecognised status "
                f"'{cells[columns[0]]}' - expected one of {', '.join(VALID_STATUSES)}"
            )
            continue
        if status != "VERIFIED":
            continue

        verified += 1
        paths = cited(cells[columns[1]])
        if not paths:
            errors.append(f"{rel}: '{cells[0]}' is VERIFIED but cites no artifact")
            continue
        missing = [path for path in paths if not (ROOT / path).exists()]
        if missing:
            errors.append(
                f"{rel}: '{cells[0]}' cites missing artifacts: {', '.join(missing)}"
            )

    if columns is None:
        errors.append(f"{rel}: no milestone table with Status/Evidence columns found")

    return rows, verified


def main():
    errors = []
    total_rows = 0
    total_verified = 0
    for rel in DOCS:
        rows, verified = check_doc(rel, errors)
        total_rows += rows
        total_verified += verified

    if errors:
        print("AUDIT EVIDENCE BLOCK")
        for item in errors:
            print(f"- {item}")
        return 1

    print(f"AUDIT EVIDENCE PASS rows={total_rows} verified={total_verified}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
