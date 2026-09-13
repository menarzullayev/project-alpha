# M5 — Canonical Records & Execution Integrity

Project Alpha CLI record commands now create canonical Markdown artifacts in addition to immutable event history.

## Canonical locations

- Evidence: `docs/evidence/EVID-*.md`
- Decisions: `.project-alpha/decisions/DEC-*.md`
- Approvals: `.project-alpha/approvals/APR-*.md`
- Handoffs: `.project-alpha/handoffs/<from>__to__<to>.md`

The integrity audit consumes these Markdown records. Event JSON remains the immutable workflow/event history and is not replaced by the canonical records.

## CLI examples

```bash
project-alpha evidence --evidence-id EVID-001 --claim "Market claim" --source "https://example.com" --date 2026-09-13 --confidence high --type FACT --risk LOW

project-alpha decision --decision-id DEC-001 --stage 04-prd --title "Choose X" --decision "Choose X" --context "Context" --chosen-option "X" --rationale "Rationale" --impact Medium --reversibility High --risk MEDIUM --evidence EVID-001 --approval-required yes --approval-status pending

project-alpha approval --approval-id APR-001 --stage 04-prd --decision-id DEC-001 --decision "Choose X" --status approved --approver human --evidence EVID-001

project-alpha handoff --from-stage 03-market-research --to-stage 04-prd --reason "Market gate passed"
```

Canonical records must satisfy the Evidence & Decision Integrity Engine before a project can reach Production Ready.
