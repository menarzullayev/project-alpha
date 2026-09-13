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
- Workflow CLI is the stable orchestration interface.
- Every stage follows `NOT_STARTED → IN_PROGRESS → REVIEW → PASSED`, with `BLOCKED → IN_PROGRESS` recovery.
- Material claims use risk-based evidence: claim, source, date, confidence, and type.
- Material decisions, approvals, evidence, and handoffs have canonical Markdown records plus immutable event history.
- Cross-stage consistency is checked during the pipeline and again in a final global audit.
- Validation layers are structural, schema, integrity, semantic, and agent/AI audit.

## Layered authority

```text
project-state.md          # human-readable source of truth
.project-alpha/
├── state.json             # derived machine-readable runtime state
├── history/events/        # immutable workflow events
├── decisions/             # canonical decisions
├── approvals/             # canonical approvals
├── handoffs/              # stage handoff manifests
└── audit/                 # deterministic audit reports
```

`state.json` is derived and must not become a competing source of truth. Versioned schemas live under `schema/`.

## Stage contract

Every stage contains `README.md`, `STAGE.md`, `TEMPLATE.md`, `QUALITY-GATE.md`, and an `OUTPUT.md` working document in initialized product repositories.

## Executable layer

```bash
python -m pip install -e .
project-alpha init ../my-product --name "My Product" --idea "One-line idea"
project-alpha status
project-alpha validate
project-alpha audit
```

Use `docs/CLI.md` for the complete command reference.

## Versioning

Current framework version: `1.0.0`. Product repositories pin the framework version. Migrations are explicit and preserve historical outputs.

## Completion standard

A framework release is not considered complete until CI, regression coverage, clean-project bootstrap, full workflow acceptance, deterministic audits, packaging checks, and the final Production Ready gate are green.

See `AGENTS.md` and `CLAUDE.md` for the operating contract.
