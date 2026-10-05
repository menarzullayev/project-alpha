# Deployment

## Production topology (current)

| Component | Where |
| --- | --- |
| App (Next.js serverless functions + static assets) | Vercel project `opsagent-edu`, functions in `fra1` (Frankfurt) |
| Database | Supabase Postgres (eu-central-1), schema `ops_agent`, role `ops_agent_app` |
| Daily report | Vercel Cron → `GET /api/cron/daily-report` at 04:00 UTC (`vercel.json`) |
| Telegram | Each workspace's own bot → `POST /api/telegram/webhook/<integrationId>` |

The database lives in a dedicated schema with its own login role. The role owns only
`ops_agent`; the Supabase API roles (`anon`, `authenticated`) have no access to it.

### One-time database setup (as the `postgres` user, e.g. Supabase SQL editor)

```sql
CREATE ROLE ops_agent_app LOGIN PASSWORD '<strong password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT ops_agent_app TO postgres;
GRANT CREATE ON DATABASE postgres TO ops_agent_app;  -- the migrator runs CREATE SCHEMA IF NOT EXISTS
CREATE SCHEMA IF NOT EXISTS ops_agent AUTHORIZATION ops_agent_app;
REVOKE ALL ON SCHEMA ops_agent FROM PUBLIC;
ALTER ROLE ops_agent_app SET search_path = ops_agent, public;
ALTER ROLE ops_agent_app SET statement_timeout = '15s';
```

Connection strings (Supavisor):

- runtime `DATABASE_URL`: `postgres://ops_agent_app.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres`
- migrations `MIGRATION_DATABASE_URL`: same host, port `5432` (session mode).

### Vercel project settings

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | `apps/ops-agent` (when the repo is connected through Vercel's GitHub integration) |
| Build command | `npm run db:migrate && npm run build` (migrations are idempotent and run before each build) |
| Node | 22.x |
| Env | `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `ENCRYPTION_KEY`, `CRON_SECRET`, `APP_URL`, `LLM_PROVIDER` (+ LLM key) |
| Deployment protection | Vercel Authentication on previews only; production is public |

### Continuous deployment

`main` is the production branch. The pipeline is: PR → CI (`ops-agent / verify`) → merge →
`ops-agent / deploy` (GitHub Actions) → `vercel deploy --prod` → health smoke test.

- The deploy job needs the repository secret **`VERCEL_TOKEN`** (Vercel → Account Settings → Tokens;
  GitHub → Settings → Secrets → Actions). Without it the job is skipped with a warning.
- The Vercel project's install command is
  `[ -d src ] || curl …/tar.gz/refs/heads/main | tar -x … ; npm ci` — CLI uploads already contain the
  source, while an API/dashboard redeploy without files builds the latest `main` from GitHub.
- Alternative: connect the repository in Vercel (Project → Settings → Git, root directory
  `apps/ops-agent`, default install command); Vercel then deploys `main` itself and the deploy job can be removed.

## Alternative targets

- **Docker** (any VPS / Fly / Railway / Cloud Run): `docker build -t opsagent apps/ops-agent`;
  run migrations with `docker compose run --rm migrate` or `npm run db:migrate` from CI;
  the container serves on `:3000` and has a `HEALTHCHECK` on `/api/health`.
- **Netlify**: `netlify.toml` and a scheduled function (`netlify/functions/daily-report.mts`) are included.

## Post-deploy checklist

1. `GET /api/health` → `{"status":"ok"}` (config + database).
2. Sign up, load the demo workspace, run the test chat booking flow.
3. Connect the real Telegram bot on the **Telegram** page; send `/start` to the bot.
4. Optionally seed a demo workspace: `DATABASE_URL=… DEMO_PASSWORD=… npm run db:seed`.
5. Run the E2E suite against production: `E2E_BASE_URL=https://… npm run test:e2e`.

## Rollback

Vercel → Deployments → previous deployment → **Promote to production**. Migrations are additive;
if a migration must be reverted, write a new forward migration.
