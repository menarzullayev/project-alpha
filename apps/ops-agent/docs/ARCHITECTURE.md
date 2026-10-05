# Architecture

## Overview

```
                ┌───────────── Next.js 16 (App Router) ─────────────┐
 Telegram ──▶   │ /api/telegram/webhook/[integrationId]             │
 (per-org bot)  │      │ secret header check · rate limit · zod     │
                │      ▼                                            │
                │ domains/telegram-webhook  (idempotency claim)     │
                │      ▼                                            │
                │ agent/orchestrator ──▶ agent/engine (pure)        │──▶ PostgreSQL
                │      │  CRM · bookings · handoff · notifications  │    (schema ops_agent)
                │      ▼                                            │
                │ providers/messaging (Telegram | Sandbox)  ──▶ Telegram Bot API
 Browser ──▶    │ Server components (pages)  +  /api/v1 REST        │
                └───────────────────────────────────────────────────┘
```

## Layers

| Layer | Location | Rule |
| --- | --- | --- |
| UI | `src/app/**/page.tsx`, `src/components/**` | Render data; call `/api/v1` for mutations. No business rules. |
| HTTP | `src/server/http/api.ts`, `src/app/api/**/route.ts` | Auth, RBAC, CSRF origin check, rate limits, validation, error mapping, request logs. |
| Domains | `src/server/domains/*.ts` | Business logic. Every function takes a `TenantContext` and scopes by `orgId`. |
| Agent | `src/server/agent/*` | `engine.ts` is a pure decision function; `orchestrator.ts` applies its side effects. |
| Providers | `src/server/providers/{llm,messaging}` + `domains/notifications.ts` | Swappable adapters behind small interfaces. |
| Data | `src/server/db/schema.ts`, `drizzle/*.sql` | Drizzle ORM schema and SQL migrations. |

### Domains

`auth` (users, sessions, invitations) · `team` (memberships, roles, organization settings) ·
`customers` · `leads` · `courses` (+ slots) · `bookings` · `conversations` · `messages`
(inside orchestrator/conversations) · `knowledge` · `agent-settings` · `integrations` ·
`telegram-webhook` · `notifications` · `audit` · `analytics` · `demo`.

## Multi-tenancy

- Every tenant-owned table has `org_id` with `ON DELETE CASCADE` to `organizations`.
- The API layer builds a `TenantContext` from the session's **active membership**; services
  never accept an organization id from request input.
- Every read/update/delete filters by `org_id`; cross-references (course, slot, assignee,
  customer) are re-validated inside the tenant before use.
- Webhooks resolve the tenant from the integration id **and** a per-integration secret.
- Covered by `tests/integration/tenant-isolation.test.ts` (36 cases) and an E2E test.
- Tables live in the dedicated Postgres schema `ops_agent`, owned by a dedicated role, with
  `anon`/`authenticated` revoked — on Supabase they are not reachable through PostgREST.

## RBAC

`src/server/rbac.ts` holds the permission table (minimum role per permission). Roles are
ordered `viewer < operator < admin < owner`. Members can only assign roles below their own
(owners can assign any); the last owner cannot be demoted or removed.

## AI agent

1. **NLU** (`nlu.ts`, `language.ts`, `text.ts`): multilingual keyword lexicon with suffix-tolerant
   stem matching (Uzbek/Russian morphology), phone extraction, numbered choices, language detection.
2. **Retrieval** (`retrieval.ts`): scores courses (keywords, name, category) and **approved**
   knowledge articles. Ambiguous matches resolve to nothing rather than a guess.
3. **Decision** (`engine.ts`): pure function → reply + actions (`set_interest`, `save_name`,
   `save_phone`, `book`, `handoff`) + next conversation state. Priorities: safety (complaint,
   human request) → booking funnel continuation → fresh intents → knowledge → clarify → escalate.
4. **Grounding**: replies are rendered from records (prices, schedules, slots, approved answers).
   The optional LLM (`grounded-llm.ts`) only runs for questions the rules engine cannot answer,
   sees only approved facts, must answer `UNKNOWN` otherwise, and its output is rejected if it
   contains any number or URL not present in the facts.
5. **Orchestration** (`orchestrator.ts`): persists inbound → upserts customer → ensures one open
   lead → decides → applies actions (booking in a locking transaction, lead advancement, handoff
   + notifications) → persists the reply (unique per inbound message) → delivers with retries.

Conversation state (`stage`, `courseId`, `offeredSlotIds`, `slotId`, `language`, `unknownCount`)
is stored in `conversations.state` (JSONB).

## Reliability

| Concern | Mechanism |
| --- | --- |
| Duplicate webhooks | `webhook_events (integration_id, update_id)` unique claim; failed/stale events re-claimed atomically |
| Duplicate messages | unique `(conversation_id, external_message_id)` for inbound |
| Double replies | unique `reply_to_id` for agent messages; redelivery re-sends an undelivered reply instead of generating a new one |
| Duplicate leads | partial unique index: one open lead per customer |
| Double / over-booking | `SELECT … FOR UPDATE` on the slot + capacity check + partial unique index |
| Outbound failures | Telegram client retries with backoff, honours `retry_after`; failures mark the message `failed`, notify staff and return 500 so Telegram redelivers |
| Rate limiting | Postgres fixed-window limiter (works across serverless instances) |
| Validation | zod on every input, environment validated at boot |
| Observability | JSON logs with request id, secrets redacted; `/api/health` checks config + DB |
| Security headers | CSP, HSTS, frame-ancestors none, nosniff, referrer policy |
| Secrets at rest | Bot tokens AES-256-GCM encrypted; passwords scrypt; session tokens stored as SHA-256 |

## Provider abstractions

- `LlmProvider.complete()` — `AnthropicProvider`, `OpenAiProvider`; `null` = rules only.
- `MessagingProvider.sendText()` — `TelegramMessagingProvider`, `SandboxMessagingProvider`.
- `NotificationChannel.deliver()` — `inAppChannel`, `telegramManagerChannel`.

Adding WhatsApp/Instagram means a new `MessagingProvider`, an integration `type`, and a webhook
route that maps the payload to `InboundMessage` — the orchestrator is channel-agnostic.

## Data model (main tables)

`users`, `sessions`, `organizations`, `memberships`, `invitations`, `customers`, `leads`,
`courses`, `course_slots`, `bookings`, `integrations`, `conversations`, `messages`,
`webhook_events`, `knowledge_articles`, `agent_settings`, `notifications`, `audit_logs`,
`rate_limits`. See `src/server/db/schema.ts`.
