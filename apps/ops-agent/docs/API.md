# API & integrations

All business endpoints live under `/api/v1`, use JSON, and authenticate with the `ops_session`
HttpOnly cookie set by sign-up/login. Mutating requests must send an `Origin` header matching the
deployment (browsers do this automatically). Errors share one shape:

```json
{ "error": { "code": "validation_error", "message": "Invalid input", "details": { "email": ["Invalid email"] }, "requestId": "…" } }
```

Codes: `validation_error` 400 · `bad_request` 400 · `unauthorized` 401 · `forbidden` 403 ·
`not_found` 404 · `conflict` 409 · `password_change_required` 403 · `organization_suspended` 403 ·
`account_suspended` 403 (login) · `rate_limited` 429 (`Retry-After` header) · `internal_error` 500.
Every response carries `x-request-id`.

## Auth & workspace

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/signup` | public, rate-limited | `{name,email,password,organizationName}` → creates user + workspace (owner) |
| POST | `/api/v1/auth/login` | public, rate-limited per IP and per email | `{email,password}` |
| POST | `/api/v1/auth/logout` | — | |
| GET | `/api/v1/auth/me` | signed in | user, active org, role, memberships |
| POST | `/api/v1/auth/switch-org` | member of target | `{orgId}` |
| POST | `/api/v1/auth/change-password` | signed in, rate-limited | `{currentPassword,newPassword}`; signs out other sessions |
| POST | `/api/v1/auth/accept-invite` | public / signed in | `{token,name?,password?}` |
| POST | `/api/v1/organizations` | signed in | create another workspace |
| PATCH | `/api/v1/org` | `org:manage` (owner) | `{name?,timezone?,currency?}` |
| POST | `/api/v1/org/demo-data` | `org:manage` | load demo courses, slots, knowledge, sample chats (empty workspace only) |

## CRM

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/api/v1/leads` (`?status=&q=&limit=&offset=`) | `crm:read` / `crm:write` |
| GET / PATCH | `/api/v1/leads/:id` `{status?,notes?,assignedTo?,interestedCourseId?}` | `crm:read` / `crm:write` |
| GET / POST | `/api/v1/customers` | `crm:read` / `crm:write` |
| GET / PATCH | `/api/v1/customers/:id` | `crm:read` / `crm:write` |
| GET / POST | `/api/v1/bookings` (`?status=&upcoming=true`) `{customerId,slotId,notes?}` | `crm:read` / `bookings:write` |
| PATCH | `/api/v1/bookings/:id` `{status}` | `bookings:write` |

Lead status transitions are validated (e.g. `won → contacted` allowed, `won → qualified` not).
Bookings are idempotent per (slot, customer); a full slot returns 409.

## Catalog & knowledge

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/api/v1/courses` | `crm:read` / `catalog:write` |
| GET / PATCH / DELETE | `/api/v1/courses/:id` | `crm:read` / `catalog:write` |
| GET / POST | `/api/v1/courses/:id/slots` `{startsAt,durationMin,capacity,location}` | `crm:read` / `catalog:write` |
| DELETE | `/api/v1/slots/:id` (deactivates) | `catalog:write` |
| GET / POST | `/api/v1/knowledge` `{title,content,category,keywords[],status}` | `crm:read` / `knowledge:write` |
| PATCH / DELETE | `/api/v1/knowledge/:id` | `knowledge:write` |

## Conversations & agent

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/conversations` (`?status=bot|handoff|closed`) | `crm:read` |
| GET / PATCH | `/api/v1/conversations/:id` `{status}` | `crm:read` / `conversations:reply` |
| POST | `/api/v1/conversations/:id/messages` `{body}` — operator reply, delivered to Telegram | `conversations:reply` |
| GET / PATCH | `/api/v1/agent/settings` | `crm:read` / `agent:configure` |
| POST | `/api/v1/agent/test-chat` `{text, clientMessageId(uuid)}` | `crm:write` |
| POST | `/api/v1/agent/test-chat/reset` | `crm:write` |

## Integrations, team, ops

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST / PATCH / DELETE | `/api/v1/integrations/telegram` (`POST {botToken}`, `PATCH {managerChatId?,status?}`) | `crm:read` / `integrations:manage` |
| POST | `/api/v1/integrations/telegram/sandbox` | `integrations:manage` |
| GET | `/api/v1/team` | `team:read` |
| POST | `/api/v1/team/invitations` `{email,role}` → `{inviteUrl}` | `team:manage` |
| DELETE | `/api/v1/team/invitations/:id` | `team:manage` |
| PATCH / DELETE | `/api/v1/team/members/:userId` | `team:manage` (DELETE self allowed) |
| GET | `/api/v1/audit` | `audit:read` |
| GET | `/api/v1/notifications`, POST `/api/v1/notifications/read` | `dashboard:read` |
| GET | `/api/v1/analytics/overview` | `dashboard:read` |
| GET | `/api/health` | public |
| GET | `/api/cron/daily-report` | `Authorization: Bearer $CRON_SECRET` |

## Telegram webhook

`POST /api/telegram/webhook/:integrationId`

- Registered automatically by `setWebhook` with `secret_token`; requests without the matching
  `X-Telegram-Bot-Api-Secret-Token` get 401.
- Handles private-chat `message` updates with `text` or a shared `contact`; `/start` greets.
  Group chats, bots and media are acknowledged and ignored.
- Responses: `200 {ok,status:"processed"|"duplicate"|"ignored"}`; `500` on a transient failure
  so Telegram redelivers; `429` when the per-bot limit (600/min) is exceeded.
- Idempotency key: `(integration, update_id)`; processing is also idempotent per message.

## Roles

| Permission | viewer | operator | admin | owner |
| --- | :-: | :-: | :-: | :-: |
| dashboard / CRM read, team read | ✓ | ✓ | ✓ | ✓ |
| CRM write, bookings, conversation replies, test chat | | ✓ | ✓ | ✓ |
| courses, knowledge, agent settings, Telegram, team management, audit log | | | ✓ | ✓ |
| organization settings, demo data | | | | ✓ |

## Root (platform) API

Super-admin endpoints live under `/api/root/*` and require a platform role plus a fresh TOTP
verification. See [ROOT_PANEL.md](ROOT_PANEL.md#6-api-apiroot) for the full list.
