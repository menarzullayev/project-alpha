# Project Alpha — Documentation OS

Project Alpha is a reusable Documentation OS for taking a selected product idea from 0 to production-ready documentation. It is designed to be reused across many independent product repositories with Claude Agent or another compatible agent.

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
- Workflow-driven agent orchestration with explicit user control commands.
- Every stage follows `NOT_STARTED → IN_PROGRESS → REVIEW → PASSED`, with `BLOCKED` recovery.
- Material claims use risk-based evidence: claim, source, date, confidence, and type.
- Material decisions and human approvals are formally recorded.
- Cross-stage consistency is checked during the pipeline and again in a final global audit.
- Validation has three layers: structural, semantic, and AI audit.

## Stage contract

Every stage contains:

```text
README.md          # human-facing overview
STAGE.md           # agent execution contract
TEMPLATE.md        # output template
QUALITY-GATE.md    # pass/block criteria
```

A product repository initialized by the CLI receives these contracts plus an `OUTPUT.md` working document for every stage.

## Framework architecture

```text
AGENTS.md
  ↓
Global operating rules
  ↓
Stage contracts
  ↓
Project config + state
  ↓
Evidence / decisions / approvals
  ↓
Validation + lifecycle controls
```

`AGENTS.md` is the universal agent contract. `CLAUDE.md` contains Claude-specific integration rules.

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

Control stage lifecycle:

```bash
project-alpha-workflow 01-vision start
project-alpha-workflow 01-vision review
project-alpha-workflow 01-vision pass --approved-by "human"
```

Migrate an existing product repository:

```bash
project-alpha migrate --to 1.0.0
```

See `docs/CLI.md` for the complete command reference.

## Versioning

Current framework version: `1.0.0`.

Product repositories pin the framework version. Migrations are explicit and preserve historical outputs; there are no silent rewrites.

## Validation result

```text
PASS
WARN
BLOCK
HUMAN_APPROVAL_REQUIRED
```

See `AGENTS.md` and `CLAUDE.md` for the operating contract.
