# Project Alpha — Documentation OS

Project Alpha is a reusable Documentation OS for taking a selected product idea from 0 to production-ready documentation. It is designed for repeated use across independent product repositories with Claude Agent or another compatible agent.

## Workflow

```text
Idea Intake → Idea Evaluation → Idea Selection
                    ↓
01 Vision → 02 Problem Discovery → 03 Market Research → 04 PRD
→ 05 Domain Model → 06 Architecture → 07 ADR → 08 Technical Spec
→ 09 Development Plan → 10 Operations → Global Audit → Production Ready
```

Idea Selection is a pre-pipeline gateway, not stage 00.

## Operating model

- Human-in-the-loop with risk-based approval.
- Full workflow CLI as the stable orchestration interface.
- Every stage follows `NOT_STARTED → IN_PROGRESS → REVIEW → PASSED`, with `BLOCKED → IN_PROGRESS` recovery.
- Material claims use risk-based evidence: claim, source, date, confidence, and type.
- Material decisions, approvals, evidence, and handoffs are formally event-recorded.
- Cross-stage consistency is checked during the pipeline and again in a final global audit.
- Validation has structural, semantic, and AI-audit layers; the current CLI implements the deterministic foundation.

## Layered runtime state

```text
project-state.md          # human-readable source of truth
.project-alpha/
├── state.json             # derived machine-readable runtime state
├── history/
│   └── events/            # immutable domain/workflow events
├── locks/                 # reserved for concurrency controls
└── cache/                 # disposable derived data
```

`state.json` is derived and must not become a competing source of truth. Git remains the repository version history; Project Alpha history records workflow semantics.

## Stage contract

Every stage contains:

```text
README.md          # human-facing overview
STAGE.md           # agent execution contract
TEMPLATE.md        # output template
QUALITY-GATE.md    # pass/block criteria
```

A product repository initialized by the CLI receives these contracts plus an `OUTPUT.md` working document for every stage.

## Executable layer

Install locally:

```bash
python -m pip install -e .
```

Initialize a product repository:

```bash
project-alpha init ../my-product --name "My Product" --idea "One-line idea"
```

Inspect and validate:

```bash
project-alpha status
project-alpha validate
project-alpha audit
```

Control the full workflow:

```bash
project-alpha stage 01-vision start
project-alpha stage 01-vision review
project-alpha stage 01-vision pass --approved-by "human"
project-alpha stage 01-vision block --reason "Missing evidence"
project-alpha stage 01-vision resume
```

Record workflow facts explicitly:

```bash
project-alpha decision --stage 01-vision --title "Target user" --decision "B2B teams"
project-alpha evidence --stage 03-market-research --claim "Market estimate" --source "source-url" --date 2026-09-12 --confidence high --type FACT
project-alpha handoff --from-stage 03-market-research --to-stage 04-prd --reason "Market gate passed"
```

Migrate an existing product repository:

```bash
project-alpha migrate --to 1.0.0
```

See `docs/CLI.md` for the complete command reference.

## Versioning

Current framework version: `1.0.0`.

Product repositories pin the framework version. Migrations are explicit and preserve historical outputs; there are no silent rewrites.

## Validation results

```text
PASS
WARN
BLOCK
HUMAN_APPROVAL_REQUIRED
```

See `AGENTS.md` and `CLAUDE.md` for the operating contract.
