# Agent/AI Audit Contract

The deterministic CLI is the enforcement layer; the agent performs semantic reasoning that cannot be reduced safely to syntax alone.

## Required audit pass

Before a stage is passed, the agent must inspect its STAGE contract, OUTPUT, upstream handoff, evidence, decisions, assumptions, open questions, and quality gate. It must explicitly identify contradictions, unsupported claims, unresolved high-risk choices, missing dependencies, and material uncertainty.

## Escalation

- `PASS`: evidence and reasoning are sufficient and no material blocker remains.
- `WARN`: non-blocking uncertainty is recorded for follow-up.
- `BLOCK`: contradiction, missing required input, invalid traceability, or unsafe unresolved risk.
- `HUMAN_APPROVAL_REQUIRED`: a high-impact or irreversible decision crosses the human authority boundary.

AI audit findings must be written to the relevant audit record. The agent must never convert an AI judgment into a human approval without an actual human approval record.

## Final audit

Global audit must combine deterministic workflow/schema/integrity/semantic checks with this AI review. Production Ready requires explicit human approval after the combined review is clean.
