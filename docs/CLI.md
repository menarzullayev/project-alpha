# Project Alpha CLI

The CLI is the executable orchestration layer of the Documentation OS. Markdown contracts remain authoritative; deterministic validators enforce filesystem, version, state, lifecycle, record, semantic, schema, and audit invariants.

## Install

```bash
python -m pip install -e .
```

## Initialize

```bash
project-alpha init ../my-product --name "My Product" --repository "github.com/org/my-product" --idea "One-line product idea"
```

Initialization creates `.project-alpha/project-state.md`, derived `state.json`, configuration/templates, event history, and Idea Selection + stages 01–10 with contracts and `OUTPUT.md` files.

## Inspect and validate

```bash
project-alpha status
project-alpha validate
project-alpha validate --structural-only
project-alpha audit
```

`audit` runs the global workflow, machine-readable schema, evidence/decision integrity, and cross-stage semantic checks.

## Full workflow lifecycle

```bash
project-alpha stage 01-vision start
project-alpha stage 01-vision review
project-alpha stage 01-vision pass --approved-by "human" --reason "Gate approved"
project-alpha stage 01-vision block --reason "Missing evidence"
project-alpha stage 01-vision resume
```

Transitions are guarded. High-impact stages require explicit human approval. Each transition becomes an immutable event under `.project-alpha/history/events/`.

## Formal records

```bash
project-alpha evidence --evidence-id EVID-001 --stage 03-market-research --claim "Market estimate" --source "source-url" --date 2026-09-12 --confidence high --type FACT --risk LOW
project-alpha decision --decision-id DEC-001 --stage 04-prd --title "Choose X" --decision "Choose X" --context "Context" --chosen-option "X" --rationale "Rationale" --impact Medium --reversibility High --risk MEDIUM --evidence EVID-001 --approval-required yes --approval-status pending
project-alpha approval --approval-id APR-001 --stage 04-prd --decision-id DEC-001 --status approved --approver human
project-alpha handoff --from-stage 03-market-research --to-stage 04-prd --reason "Market gate passed"
```

These commands create canonical Markdown records and immutable event-history entries. They never fabricate missing evidence or approvals.

## Layered state, schema, and history

`project-state.md` is the human-readable source of truth. `state.json` is a derived machine-readable representation validated against the versioned schema under `schema/1.0.0/`. Event records capture workflow semantics separately from Git commits. Schema validation never silently promotes JSON above Markdown authority.

## Version migration

```bash
project-alpha migrate --to 1.0.0
```

Migrations are explicit. Historical outputs are preserved and unsupported target versions are blocked.

## Validation results

```text
PASS
WARN
BLOCK
HUMAN_APPROVAL_REQUIRED
```

See `AGENTS.md` and `CLAUDE.md` for the agent operating contract.
