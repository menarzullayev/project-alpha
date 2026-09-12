# Claude Integration

Project Alpha is an agent-operated Documentation OS. Follow `AGENTS.md` as the canonical operating contract.

## Claude-specific rules
- Start by reading `project-state.md`, `project-config.md`, relevant upstream outputs, and the current stage's `STAGE.md`.
- Execute the current stage contract before creating or changing deliverables.
- Use web/tool research when required by the stage; record material evidence and dates.
- Do not silently convert assumptions into facts.
- Stop for formal human approval when the contract requires it.
- Before marking a stage `PASSED`, run its quality gate and relevant cross-stage checks.
- Keep `project-state.md` synchronized with meaningful workflow transitions.
- When revisiting a stage, identify downstream documents that may become stale and revalidate them.
- Treat framework version and migration state as immutable history unless an explicit migration is being performed.

## Explicit control commands
Support commands such as:
- run/re-run a stage
- go back to a previous stage
- show pending decisions or approvals
- audit contradictions
- explain a blocker
- run structural, semantic, or AI validation
- prepare a framework migration

Do not skip a mandatory quality gate or human approval merely because a command requests progression.
