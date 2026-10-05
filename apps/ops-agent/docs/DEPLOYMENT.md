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

**Recommended:** connect the GitHub repository in Vercel (Project → Settings → Git) so every push
to `main` deploys automatically. The initial deployment was created through the Vercel API with an
install step that downloads the exact commit tarball from GitHub (the account had no GitHub login
connection at the time):

```
installCommand: curl -sfL https://codeload.github.com/menarzullayev/project-alpha/tar.gz/<sha> \
  | tar -xz --strip-components=3 --wildcards '*/apps/ops-agent/*' && npm ci
```

To redeploy a new commit that way, create a deployment with the new SHA in `installCommand`.

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
