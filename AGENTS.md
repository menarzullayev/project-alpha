# Project Alpha — Agent Operating Contract

## Purpose
Project Alpha is a Documentation OS for taking a selected product idea from 0 to production-ready documentation through a controlled workflow.

## Operating model
- Human-in-the-loop: the agent performs research, analysis, drafting, consistency checks, and risk detection autonomously.
- Human approval is required for high-impact or irreversible product, business, architecture, and production decisions.
- Normal operation is workflow-driven, but explicit user commands can re-run, revisit, audit, or inspect stages.

## Pipeline
Idea Intake → Idea Evaluation → Idea Selection → 01 Vision → 02 Problem Discovery → 03 Market Research → 04 PRD → 05 Domain Model → 06 Architecture → 07 ADR → 08 Technical Spec → 09 Development Plan → 10 Operations → Global Audit → Production Ready.

Idea Selection is a pre-pipeline gateway, not stage 00.

## Stage lifecycle
NOT_STARTED → IN_PROGRESS → REVIEW → PASSED
REVIEW → BLOCKED → IN_PROGRESS
A stage must not be treated as passed until its quality gate succeeds.

## Authority hierarchy
1. Global rules in AGENTS.md
2. Stage contract in the stage's STAGE.md
3. Project configuration
4. Decision Log

Lower layers may clarify or strengthen rules within scope, but must not weaken global safety, evidence, or mandatory approval invariants.

## Evidence policy
Use risk-based evidence. Material external claims must record:
- CLAIM
- SOURCE
- DATE
- CONFIDENCE
- TYPE: FACT | INFERENCE | ASSUMPTION

Do not fabricate sources. Clearly distinguish evidence from inference and assumptions.

## Decisions and approvals
Material decisions belong in the Decision Log. Human approvals use formal approval records and must identify the decision, context, options, recommendation, risk, approver, timestamp, and status.

## Cross-stage consistency
Every stage must check relevant upstream dependencies. Contradictions block progression. After stage 10, run a global audit covering requirements, business rules, architecture, security, performance, cost, operations, evidence, decisions, unresolved assumptions, and production readiness.

## Validation layers
1. Structural validation — files, paths, versions, formats.
2. Semantic validation — required sections, dependencies, gates, approvals.
3. AI audit — contradictions, reasoning quality, risks, completeness.

Expected results: PASS | WARN | BLOCK | HUMAN_APPROVAL_REQUIRED.

## Project isolation and versioning
Each product is an independent repository that pins a Project Alpha framework version. Framework updates use explicit migrations; never silently rewrite a project's historical documentation.

## Agent behavior
- Read current project state before acting.
- Preserve traceability between claims, decisions, approvals, and outputs.
- Never silently invent missing facts.
- Ask the user only when a decision genuinely requires human authority or missing information cannot be responsibly inferred.
- Keep project-state.md current after meaningful workflow transitions.
- Prefer reversible changes; explain blockers and dependencies.
