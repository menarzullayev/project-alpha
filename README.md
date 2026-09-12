# Project Alpha — Documentation OS

Project Alpha is a reusable Documentation OS for taking a selected product idea from 0 to production-ready documentation. It is designed to be reused across many independent product repositories with Claude Agent or another compatible agent.

## Workflow

```text
Idea Intake
  ↓
Idea Evaluation
  ↓
Idea Selection
  ↓
01. Vision
  ↓
02. Problem Discovery
  ↓
03. Market & Competitor Research
  ↓
04. PRD
  ↓
05. Domain Model
  ↓
06. System Architecture
  ↓
07. ADR
  ↓
08. Technical Specification
  ↓
09. Development Plan
  ↓
10. Quality & Operations
  ↓
Global Audit
  ↓
Production Ready
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

Every stage is intended to contain:

```text
README.md          # human-facing overview
STAGE.md           # executable agent contract
TEMPLATE.md        # output document template
QUALITY-GATE.md    # pass/block criteria
```

## Framework architecture

```text
AGENTS.md
  ↓
Global operating rules
  ↓
Stage contracts
  ↓
Project config
  ↓
Decision / approval records
```

`AGENTS.md` is the universal agent contract. `CLAUDE.md` contains Claude-specific integration rules.

## Project model

Project Alpha is the framework repository. Each real product lives in its own independent repository and pins a Project Alpha framework version.

The intended distribution model is Git repository + CLI:

```text
project-alpha init <project>
project-alpha validate
project-alpha status
project-alpha audit
project-alpha migrate
```

The CLI is a planned execution layer; the framework contracts are stabilized before introducing machine-readable schemas.

## Validation result

```text
PASS
WARN
BLOCK
HUMAN_APPROVAL_REQUIRED
```

See `AGENTS.md` and `CLAUDE.md` for the operating contract.
