# Project Alpha — Agent Operating Contract

## Purpose
Project Alpha is a reusable Documentation OS for taking a selected product idea from 0 to production-ready documentation across independent product repositories.

## Operating model
- Human-in-the-loop: the agent performs research, analysis, drafting, consistency checks, and risk detection autonomously.
- Human approval is required for high-impact or irreversible product, business, architecture, and production decisions.
- The agent must read current state and relevant upstream outputs before acting.

## Pipeline
Idea Intake → Idea Evaluation → Idea Selection → 01 Vision → 02 Problem Discovery → 03 Market Research → 04 PRD → 05 Domain Model → 06 Architecture → 07 ADR → 08 Technical Spec → 09 Development Plan → 10 Operations → Global Audit → Production Ready.

Idea Selection is a pre-pipeline gateway, not stage 00.

## Stage lifecycle
NOT_STARTED → IN_PROGRESS → REVIEW → PASSED
BLOCKED → IN_PROGRESS
A stage must not be treated as passed until its quality gate succeeds.

## Authority hierarchy
1. `AGENTS.md`
2. Stage `STAGE.md`
3. Project configuration/state
4. Decision records

Markdown is the human source of truth. `.project-alpha/state.json` is derived machine-readable state and may not silently override Markdown.

## Evidence and decisions
Material claims use risk-based evidence: CLAIM, SOURCE, DATE, CONFIDENCE, TYPE (`FACT | INFERENCE | ASSUMPTION`), and RISK. Never fabricate sources.

Material decisions, approvals, and handoffs use canonical records plus immutable event history. High-risk decisions require evidence and human approval.

## Validation layers
1. Structural validation
2. Machine-readable schema validation
3. Evidence/decision integrity validation
4. Cross-stage semantic validation
5. Agent/AI reasoning audit
6. Final global audit

Expected results: `PASS | WARN | BLOCK | HUMAN_APPROVAL_REQUIRED`.

## Recovery
State/runtime drift, malformed event history, missing required records, and inconsistent stage state are blockers. Recovery must be deterministic and reversible; never silently rewrite historical events.

## Versioning and isolation
Each product repository pins a framework version. Framework updates use explicit migrations. Historical documentation and event history must be preserved.

## Final production gate
Global Audit may become `READY` only after all deterministic gates pass. `PRODUCTION_READY` requires an explicit human approval record after the combined deterministic and AI audit.

See `docs/AI-AUDIT.md`, `RELEASE.md`, and `COMPLETION.md` for execution and release requirements.
