# Framework Migrations

Project Alpha versions are pinned by consuming product repositories.

## Rules
- Never silently rewrite historical project documentation.
- Every framework release that changes contracts, templates, gates, or required metadata must document migration impact.
- Migrations must identify affected files, automatic changes, manual review requirements, and rollback considerations.
- High-impact semantic migrations require human approval.

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

No migrations are defined yet; the framework is initially versioned at 1.0.0.
