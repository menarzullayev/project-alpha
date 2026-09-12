# Project Alpha CLI

The CLI is the executable orchestration layer of the Documentation OS. Markdown contracts remain authoritative; the CLI enforces deterministic filesystem, version, state, lifecycle, and event invariants.

## Install

```bash
python -m pip install -e .
```

## Initialize

```bash
project-alpha init ../my-product --name "My Product" --repository "github.com/org/my-product" --idea "One-line product idea"
```

Initialization creates `.project-alpha/project-state.md`, derived `state.json`, configuration/decision/approval templates, event history, and Idea Selection + stages 01–10 with their contracts and `OUTPUT.md` files.

## Inspect and validate

```bash
project-alpha status
project-alpha validate
project-alpha validate --structural-only
project-alpha audit
```

## Full workflow lifecycle

```bash
project-alpha stage 01-vision start
project-alpha stage 01-vision review
project-alpha stage 01-vision pass --approved-by "human" --reason "Gate approved"
project-alpha stage 01-vision block --reason "Missing evidence"
project-alpha stage 01-vision resume
```

Transitions are guarded. High-impact stages require explicit human approval. Each transition becomes an immutable event under `.project-alpha/history/events/`.

## Formal records

```bash
project-alpha decision --stage 01-vision --title "Target user" --decision "B2B teams"
project-alpha approval --stage 01-vision --approver "human" --decision PASS --reason "Approved"
project-alpha evidence --stage 03-market-research --claim "Market estimate" --source "source-url" --date 2026-09-12 --confidence high --type FACT
project-alpha handoff --from-stage 03-market-research --to-stage 04-prd --reason "Market gate passed"
```

These commands record semantic events. They do not silently manufacture evidence, decisions, approvals, or stage outputs.

## Layered state and history

`project-state.md` is the human-readable source of truth. `state.json` is derived runtime state. Event records capture workflow semantics separately from Git commits. This permits audit, recovery, and future checkpoint snapshots without making JSON a competing authority.

## Version migration

```bash
project-alpha migrate --to 1.0.0
```

Migrations are explicit. Historical outputs are preserved and unsupported target versions are blocked.

## Current boundary

Version 1.0.0 provides the deterministic core: initialization, layered state, lifecycle transitions, event recording, structural/semantic validation, and global audit. A standalone AI audit engine, external-tool adapters, schema layer, and richer migration/checkpoint engine remain subsequent execution layers.
