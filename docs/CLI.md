# Project Alpha CLI

The CLI is the first executable layer of the Documentation OS. It does not replace the Markdown contracts; it enforces their filesystem, version, and lifecycle invariants.

## Install

```bash
python -m pip install -e .
```

## Initialize a product repository

```bash
project-alpha init ../my-product --name "My Product" --repository "github.com/org/my-product" --idea "One-line product idea"
```

Initialization creates:

- `.project-alpha/project-config.md`
- `.project-alpha/project-state.md`
- `.project-alpha/decision-log.md`
- `.project-alpha/approval-record.md`
- `.project-alpha/history.md`
- Idea Selection + stages 01–10 with `STAGE.md`, `TEMPLATE.md`, `QUALITY-GATE.md`, and `OUTPUT.md`

## Inspect and validate

```bash
project-alpha status
project-alpha validate
project-alpha validate --structural-only
project-alpha audit
```

Validation is deterministic. The global audit additionally requires every pipeline stage to be `PASSED`.

## Stage lifecycle

```bash
project-alpha-workflow 01-vision start
project-alpha-workflow 01-vision review
project-alpha-workflow 01-vision pass --approved-by "human"
project-alpha-workflow 01-vision block --reason "Missing strategic decision"
project-alpha-workflow 01-vision unblock
```

High-impact stages require `--approved-by` before they can be passed. The approval is appended to `.project-alpha/approval-record.md` and the transition is appended to `history.md`.

## Version migration

```bash
project-alpha migrate --to 1.0.0
```

Migrations never rewrite historical product outputs silently. Unsupported target versions are blocked.

## Design boundary

Current version deliberately keeps the source of truth in Markdown. Machine-readable schemas, AI semantic audit, adapters for external tools, and richer migration engines are subsequent execution layers rather than hidden dependencies of the core framework.
