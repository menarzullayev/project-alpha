# Claude Integration

Project Alpha is an agent-operated Documentation OS. Follow `AGENTS.md` as the canonical operating contract.

## Claude-specific rules
- Start by reading `.project-alpha/project-state.md`, `.project-alpha/project-config.md`, relevant upstream outputs, and the current stage's `STAGE.md`.
- Execute the current stage contract before creating or changing deliverables.
- Use web/tool research when required by the stage; record material evidence and dates.
- Do not silently convert assumptions into facts.
- Stop for formal human approval when the contract requires it.
- Before marking a stage `PASSED`, run its quality gate and relevant cross-stage checks.
- Keep `.project-alpha/project-state.md` synchronized with meaningful workflow transitions.
- When revisiting a stage, identify downstream documents that may become stale and revalidate them.
- Treat framework version and migration state as immutable history unless an explicit migration is being performed.

## Executable controls
The framework ships deterministic CLI controls:

```text
project-alpha init
project-alpha status
project-alpha validate
project-alpha audit
project-alpha migrate
project-alpha-workflow <stage> start|review|pass|block|unblock
```

The CLI enforces filesystem, version, lifecycle, and formal approval invariants. Claude remains responsible for semantic work, research, cross-stage reasoning, and AI audit. The CLI must not be treated as a substitute for agent reasoning or human approval.

When Claude needs to revisit a stage, use the workflow controls rather than editing lifecycle state silently. When a stage is blocked, preserve the blocker and re-enter through `unblock` after the dependency is resolved.

Do not skip a mandatory quality gate or human approval merely because a command requests progression.
