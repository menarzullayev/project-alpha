# Project Alpha Schema — 1.0.0

The schema layer defines the machine-readable contract for runtime state and canonical records.

- `project-state.schema.json` documents `.project-alpha/state.json`.
- `record.schema.json` documents the canonical record family.
- `project_alpha_schema.py` performs deterministic validation with the Python standard library.

Markdown remains the human-readable source of truth. JSON is derived execution state and cannot silently override Markdown.