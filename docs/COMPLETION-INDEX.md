# Completion Program Index

Index of the Project Alpha framework completion program. Every row cites the repository
artifact that evidences the milestone. A milestone is **not** complete because an issue is
closed — see the authority rule in `COMPLETION.md`.

Status values: `VERIFIED` (artifact present, and gated by `scripts/audit_evidence_check.py`)
· `OPEN` (no artifact yet).

| Milestone | Title | Status | Evidence |
| --- | --- | --- | --- |
| M1 | Foundation | VERIFIED | `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/01-vision/` |
| M2 | Workflow Engine | VERIFIED | `cli/project_alpha_workflow.py`, `tests/test_cli.py` |
| M3 | Evidence & Decision Integrity | VERIFIED | `cli/project_alpha_integrity.py`, `docs/M5-RECORD-CONTRACT.md` |
| M4 | Cross-Stage Semantic Consistency | VERIFIED | `cli/project_alpha_semantic.py`, `tests/test_semantic.py` |
| M5 | Canonical Records | VERIFIED | `docs/M5-CANONICAL-RECORDS.md`, `docs/M5-ACCEPTANCE.md`, `tests/test_records.py` |
| M6 | Machine-Readable Schema | VERIFIED | `schema/1.0.0/`, `cli/project_alpha_schema.py`, `tests/test_schema.py` |
| M7 | Deterministic Recovery | VERIFIED | `cli/project_alpha_recovery.py`, `tests/test_recovery.py` |
| M8 | Agent/AI Audit Contract | VERIFIED | `docs/AI-AUDIT.md`, `AGENTS.md` |
| M9 | Packaging & Distribution | VERIFIED | `pyproject.toml`, `VERSION`, `scripts/release_check.py` |
| M10 | E2E Acceptance | VERIFIED | `tests/test_e2e.py` |
| M11 | Operational Release Gate | VERIFIED | `RELEASE.md` |
| M12 | Regression Suite | VERIFIED | `.github/workflows/ci.yml`, `tests/` |
| M13 | Completion Gate | VERIFIED | `COMPLETION.md` |
| M14 | Bootstrap Acceptance | VERIFIED | `cli/project_alpha.py`, `tests/test_e2e.py`, `templates/` |
| M15 | Record CLI Contract | VERIFIED | `docs/M5-RECORD-CONTRACT.md`, `docs/CLI.md`, `cli/project_alpha.py`, `tests/test_records.py` |
| M16 | Release Candidate Audit | VERIFIED | `scripts/release_check.py`, `docs/CLI.md`, `.github/workflows/ci.yml` |
| M17 | Completion Program Index | VERIFIED | `docs/COMPLETION-INDEX.md` |
| M18 | Stop Condition | VERIFIED | `COMPLETION.md`, `AGENTS.md`, `CLAUDE.md`, `RELEASE.md` |

## Declared overlaps

- **M15** carries no artifact of its own. Its contract is enforced by the M5 record layer
  (`docs/M5-RECORD-CONTRACT.md`, `docs/M5-CANONICAL-RECORDS.md`) and the CLI record commands.
  M15 is therefore recorded as an explicit **re-verification** of M5, not as a separate
  implementation. This overlap is declared rather than hidden.
- **M1–M4** predate issue-level tracking. Their evidence is file-level and CI-gated, as listed
  above. No retroactive issue was opened for them: creating tracking after the fact would
  fabricate process history, which `COMPLETION.md` forbids.

## Not part of this program

- **M19 — Clean up tracking issues** (issue #15) is `CLOSED / NOT_PLANNED`. It is a housekeeping
  item, not a completion milestone, and is intentionally absent from this index.

## Open items

None. All milestones M1–M18 are `VERIFIED` against a repository artifact.

## Authority

This index is a tracking artifact. It does not by itself make the framework production ready.
Production readiness additionally requires a clean global audit and an explicit human approval
record — see `RELEASE.md` and `FINAL-AUDIT.md`.
