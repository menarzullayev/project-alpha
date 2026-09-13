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

## Deterministic controls

```text
project-alpha init
project-alpha status
project-alpha validate
project-alpha audit
project-alpha migrate
project-alpha-workflow <stage> start|review|pass|block|unblock
```

The CLI enforces filesystem, version, lifecycle, schema, integrity, recovery, semantic, and formal approval invariants. Claude remains responsible for semantic work, research, cross-stage reasoning, and AI audit.

## Canonical records

Use the CLI record commands for evidence, decisions, approvals, and handoffs so canonical Markdown records and immutable event history remain synchronized. Do not hand-edit event history.

## Recovery

If state or runtime representations drift, run the deterministic recovery/global audit. Resolve the underlying cause and re-enter through the supported workflow transition. Never rewrite history to conceal drift.

## AI audit boundary

Claude must perform the reasoning audit described in `docs/AI-AUDIT.md`. A model judgment is not a human approval. Production Ready requires an actual human approval record after all deterministic and AI checks pass.

Do not skip a mandatory quality gate or human approval merely because a command requests progression.
