# OpsAgent — AI Operations Agent for education centres

OpsAgent is a multi-tenant B2B SaaS that runs an AI agent on each customer's
own **Telegram bot**. It answers prospective students, captures leads into a
built-in CRM, books **trial lessons** into real time slots and hands
conversations to staff when needed.

```
Telegram message → AI agent → course / FAQ / price → trial booking → CRM lead → human handoff → daily report
```

## Features

| Area | What you get |
| --- | --- |
| Auth & workspaces | Email + password, secure sessions, several workspaces per account, invitation links |
| RBAC | `owner` › `admin` › `operator` › `viewer`, enforced on every API route and page |
| CRM | Customers, lead pipeline (new → contacted → qualified → trial_booked → won/lost), assignment, notes |
| Catalog | Courses (price, schedule, keywords) and trial-lesson slots with capacity |
| Bookings | Overbooking-safe, idempotent; status tracking (confirmed / attended / no-show / cancelled) |
| AI agent | Grounded answers in Uzbek, Russian and English; booking funnel; escalation rules; optional LLM |
| Conversations | Live inbox, handoff queue, operator replies sent to Telegram, take over / hand back |
| Knowledge base | Approved answers only — drafts are never sent to customers |
| Telegram | Per-workspace bot onboarding (token → verification → webhook), sandbox bot for demos |
| Notifications | Dashboard notification centre + optional manager Telegram chat |
| Analytics | KPIs, leads per day, pipeline, top courses, automation rate, daily report |
| Audit | Every change by staff or the agent is logged |
| Root panel (`/root`) | Platform super-admin console: KPIs, users, organizations, plans, suspension, settings, announcements, audit, CSV reports; mandatory TOTP 2FA, platform RBAC, uz/ru/en, light/dark — see [docs/ROOT_PANEL.md](docs/ROOT_PANEL.md) |

## Quick start (local)

Requirements: Node 20.9+ (22 recommended) and PostgreSQL 14+.

```bash
cd apps/ops-agent
npm ci
cp .env.example .env            # then set DATABASE_URL, ENCRYPTION_KEY, CRON_SECRET
npm run db:migrate
DEMO_PASSWORD=ChangeMe12345 npm run db:seed   # optional: demo@opsagent.uz workspace
npm run dev                     # http://localhost:3000
```

Or with Docker: `docker compose up --build` (Postgres + migrations + app).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development / production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript over app, tests and scripts |
| `npm test` | Vitest: unit + integration + API + DB tests (needs Postgres, see below) |
| `npm run test:e2e` | Playwright critical-path E2E against `E2E_BASE_URL` (default `http://localhost:3100`) |
| `npm run db:generate` | Generate a SQL migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations (idempotent) |
| `npm run db:seed` | Create a demo workspace |
| `npm run verify` | lint + typecheck + test + build |
| `npm run root:grant -- <email> <superadmin\|admin\|support\|none> [name]` | Grant or revoke a platform role (creates the account with a one-time password if needed) |

Tests use `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/opsagent_test`);
the global setup recreates the `ops_agent` schema there on every run.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Setup & environment variables](docs/SETUP.md)
- [Deployment](docs/DEPLOYMENT.md)
- [API & integrations](docs/API.md)
- [Root (super-admin) panel](docs/ROOT_PANEL.md)
- [Operations runbook](docs/RUNBOOK.md)
- [Final report](FINAL_REPORT.md) — deployment URL, test results, limitations
