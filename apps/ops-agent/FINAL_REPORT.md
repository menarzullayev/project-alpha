# FINAL REPORT — OpsAgent (AI Operations Agent for education centres)

**Production URL:** https://opsagent-edu.vercel.app
**Health:** https://opsagent-edu.vercel.app/api/health → `{"status":"ok", checks: config ✓, database ✓}`
**Code:** `apps/ops-agent` on branch `claude/ai-ops-agent` (PR #16); production runs commit `09d48d8` (later commits change only tests/docs)

## What was built

A multi-tenant B2B SaaS. Each education centre connects **its own Telegram bot**. An AI agent answers
students in Uzbek, Russian or English, captures leads in a built-in CRM and books trial lessons into
real time slots. It hands conversations to staff and sends a daily report.

```
Telegram → webhook (secret-verified, idempotent) → AI agent (grounded) → CRM lead → trial booking → handoff → notifications / daily report
```

| Area | Delivered |
| --- | --- |
| Auth | Email + password (scrypt), hashed session tokens, HttpOnly/SameSite cookies, invitations, multiple workspaces per user |
| RBAC | owner › admin › operator › viewer; one permission table enforced on every API route and page |
| Tenant isolation | `org_id` scoping in every domain service; dedicated Postgres schema + role; cross-tenant ids return 404 |
| CRM | Customers, lead pipeline with validated transitions, assignment, notes |
| Catalog | Courses (price, schedule, keywords), trial slots with capacity |
| Bookings | Row-locked capacity check, partial unique index, idempotent, status workflow |
| AI agent | Pure decision engine plus orchestrator. Answers come from courses, slots and *approved* knowledge only. Booking funnel, phone/name capture, escalation rules, persisted conversation state. Optional Anthropic/OpenAI fallback behind a numeric/URL grounding guard |
| Telegram | Per-org bot onboarding (getMe → encrypted token → setWebhook with secret), inbound/outbound, contact sharing, operator replies, sandbox bot |
| Dashboard | Analytics, conversations inbox (take over / reply / hand back), leads, customers, bookings, courses & slots, knowledge base, agent settings + live test chat, Telegram, team, audit log, notifications, settings. Responsive, with empty, loading and error states |
| Reliability | zod validation, env validation, JSON logs with request ids, retries with backoff + `retry_after`, idempotency keys, Postgres rate limiting, CSRF Origin checks, security headers (CSP, HSTS…), health check, migrations, daily cron |
| Docs | README, docs/ARCHITECTURE, SETUP, DEPLOYMENT, API, RUNBOOK |

## Root (super-admin) panel — added later

`/root` is a cross-tenant console for the platform team. Details are in [docs/ROOT_PANEL.md](docs/ROOT_PANEL.md).

- **Dashboard:**
  - Platform KPIs: organizations, users, messages, AI automation rate, leads, bookings, handoffs.
  - Health: failed webhooks and deliveries, Telegram errors.
  - 30-day growth charts, the most active organizations, and recent activity.
- **User management:**
  - Search and filter users; create them with a one-time password and a forced change.
  - Edit, suspend or reactivate (a reason is required), reset passwords, sign out everywhere, reset 2FA.
  - Assign platform roles; add or remove workspace memberships.
- **Organizations:** usage, plan changes, members, Telegram status. Suspension blocks the dashboard and API, and the Telegram agent stops replying.
- **System settings:** public sign-up, maintenance banner, plan defaults, workspace limit, session lifetime, 2FA policy.
- **Announcements:** shown to all members or owners only, with severity, scheduling and an end-now action. They appear as banners in every workspace.
- **Audit log:** filterable, with CSV export.
- **Reports:** organizations and usage, users, daily growth, and the audit trail, exported as formula-safe CSV.
- **Security:**
  - Platform RBAC with three roles (support › admin › superadmin) and 12 permissions.
  - Mandatory TOTP 2FA, re-verified for every new session and every 12 h.
  - Admins cannot manage other operators. The last superadmin and the last workspace owner are protected.
  - Every action is audited, with rate limits and CSRF origin checks.
- **UI:** uz/ru/en, light/dark/system theme, responsive layout with a mobile drawer.

## Test results

| Check | Result |
| --- | --- |
| `npm run lint` | ✅ pass |
| `npm run typecheck` (app + tests + scripts) | ✅ pass |
| `npm test`: Vitest, 11 files | ✅ **274 / 274 passed** (unit, integration, API, DB, auth/RBAC, tenant isolation ×36, Telegram webhook ×20, AI workflow, failure/retry) |
| `npm run build` | ✅ pass |
| Playwright E2E, local production build | ✅ 10 / 10 |
| **Playwright E2E against the deployed production URL** (run from a Vercel Sandbox) | ✅ **10 / 10**: health, auth redirect/401, signup + demo data, AI booking end-to-end, complaint handoff + operator reply + hand-back, catalog CRUD, RBAC viewer, cross-tenant 404, Telegram webhook (bad secret 401, concurrent duplicate → one message + one reply), mobile layout |
| Production spot checks | cron 401 without secret / 200 with it; login without Origin → 403; Supabase `anon`/`authenticated`/`service_role` have no access to schema `ops_agent` |
| Existing Project Alpha Python CI | ✅ still passes (untouched) |

Bugs found and fixed during verification:
- Slot availability always 0. Drizzle emitted an unqualified `"id"` in a correlated subquery.
- The grounding guard accepted numbers hidden inside fact numbers ("50%" inside "450 000").
- Render-prop functions were passed from Server to Client components.
- Login CSRF: Origin checks were extended to unauthenticated mutations.
- E2E flakiness from pre-hydration typing.

## Security review summary

- Cookie sessions: random 256-bit tokens, stored as SHA-256, HttpOnly + SameSite=Lax + Secure.
- CSRF: the Origin must match the app host for every mutating API call.
- Passwords use scrypt with a timing-uniform failure path. Logins are rate-limited per IP and per email; sign-ups per IP.
- Bot tokens are encrypted with AES-256-GCM and never returned by the API. Webhook secrets are compared in constant time.
- All SQL goes through parameterised Drizzle queries; LIKE patterns are sanitised.
- Every input is validated with zod. React escapes all user content.
- Prompt-injection defence: the LLM sees approved facts only, and its output is post-checked.
- Secrets live only in Vercel env vars and are not committed (`.env*` is git-ignored).
- No known critical or high issues in runtime code. `npm audit` reports 5 "high" advisories, all in the **dev-only** ESLint toolchain (`braces` via `eslint-config-next`), which is not shipped to production.

## Production environment

| Item | Value |
| --- | --- |
| Hosting | Vercel project `opsagent-edu` (team narzullayev), functions in `fra1` |
| Database | Supabase project `expense-tracker` (eu-central-1), **isolated schema `ops_agent`**, role `ops_agent_app` |
| LLM | `LLM_PROVIDER=rules` (grounded engine; no LLM key provided) |
| Cron | Daily report at 04:00 UTC (09:00 Tashkent) |
| Demo workspace | `demo@opsagent.uz`. The password was handed over in the session, not stored in the repo |

## Known limitations

1. **No real Telegram bot connected yet.** No bot token was available. The live webhook path was verified in production with signed updates and a sandbox bot; the Telegram HTTP client is tested with stubs. *Action:* paste a BotFather token on the Telegram page.
2. **The LLM runs in rules mode.** The Anthropic and OpenAI providers are implemented and unit-tested with fakes but not exercised live. *Action:* set `LLM_PROVIDER` + API key in Vercel.
3. **Database shares a Supabase project.** The free plan allows 2 projects, so the app runs in an isolated schema and role inside the existing `expense-tracker` project. *Recommended:* move to a dedicated project and copy with `pg_dump --schema=ops_agent`.
4. **Vercel is not Git-connected.** The Vercel account has no GitHub login connection. Deployments use an install step that downloads the pinned commit tarball. *Action:* connect GitHub in Vercel → Settings → Git, then set Root Directory `apps/ops-agent` and clear the custom install command.
5. No email provider: invitations are copy-paste links, and there is no password reset or email verification yet.
6. The dashboard UI is English only. The agent speaks uz/ru/en, but the knowledge-base text is sent as written.
7. Conversation views refresh by polling every 8 seconds rather than realtime push.
8. Invalid ids on streamed pages show the not-found page with HTTP 200 (a streaming side-effect). APIs return proper 404s.
9. An unused Netlify site `opsagent-edu` was created during deployment attempts; its uploads were blocked by this environment's network policy. It can be deleted.

## Next most important improvements

1. Connect the centre's real Telegram bot and a manager chat; enable an LLM key for open-ended questions.
2. Connect Vercel ↔ GitHub for push-to-deploy, and add a dedicated Supabase project with backups/PITR.
3. Email (Resend): invitations, password reset, email verification, daily report by email.
4. Realtime inbox (Supabase Realtime or SSE) and browser push for handoffs.
5. Uzbek/Russian dashboard localisation; per-language knowledge answers.
6. Payments and plan limits (Click/Payme), and per-tenant usage metering.
7. More channels (Instagram Direct, WhatsApp) via the existing `MessagingProvider` interface.
8. Observability: Sentry error tracking, uptime monitor on `/api/health`, log drain.
