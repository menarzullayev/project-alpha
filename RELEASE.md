# Project Alpha Release Gate

A release is eligible only when all of the following are green:

1. Unit/regression tests pass.
2. All CLI modules compile.
3. Schema, recovery, integrity, and semantic audits pass on the acceptance fixture.
4. `project-alpha init` produces a complete isolated product workspace.
5. The full Idea Selection → Stage 10 → Global Audit workflow reaches `READY`.
6. Explicit human approval transitions Global Audit to `PRODUCTION_READY`.
7. `scripts/release_check.py` passes.
8. Wheel and source distribution build successfully.
9. No open completion-gate blocker remains.

CI is the reproducible technical gate. Human approval is the final authority for production readiness.