# Framework Migrations

Project Alpha versions are pinned by consuming product repositories.

## Rules
- Never silently rewrite historical project documentation.
- Every framework release that changes contracts, templates, gates, or required metadata must document migration impact.
- Migrations must identify affected files, automatic changes, manual review requirements, and rollback considerations.
- High-impact semantic migrations require human approval.

## Current schema

Framework `1.0.0` includes the versioned machine-readable schema under `schema/1.0.0/`. This is an execution representation only; Markdown remains authoritative.

## Migration format

```text
From:
To:
Affected:
Automatic changes:
Manual review:
Approval required:
Rollback:
```

No framework-version migration is required for the schema layer because it is additive within `1.0.0`.
