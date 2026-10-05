# Setup

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres URL used at runtime. On Supabase use the **transaction pooler** (port 6543). |
| `MIGRATION_DATABASE_URL` | no | URL for `npm run db:migrate` (Supabase: session pooler, port 5432). Falls back to `DATABASE_URL`. |
| `APP_URL` | yes (prod) | Public base URL; used for Telegram webhook URLs, invitation links and CSRF origin checks. |
| `ENCRYPTION_KEY` | yes | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts bot tokens. Do not rotate without re-entering tokens. |
| `CRON_SECRET` | prod | Bearer secret for `/api/cron/daily-report` (≥16 chars). |
| `LLM_PROVIDER` | no | `rules` (default), `anthropic` or `openai`. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | if anthropic | Defaults to `claude-haiku-4-5-20251001`. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | if openai | Defaults to `gpt-4o-mini`. |
| `SIGNUP_ENABLED` | no | `false` closes public sign-up (invitations still work). |
| `SIGNUP_RATE_LIMIT` | no | Sign-ups per IP per hour (default 10). |
| `DB_POOL_MAX` | no | Connections per server instance (default 5). |
| `LOG_LEVEL` | no | `debug` / `info` / `warn` / `error`. |

Never commit `.env*` files; only `.env.example` is tracked.

## Local database

```bash
createdb opsagent_dev && createdb opsagent_test
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/opsagent_dev
npm run db:migrate
```

## Schema changes

1. Edit `src/server/db/schema.ts`.
2. `npm run db:generate -- --name <change>` → review the SQL in `drizzle/`.
3. `npm run db:migrate` locally, run tests, commit schema + migration together.

## Connecting a Telegram bot

1. In Telegram, open **@BotFather** → `/newbot` → copy the token.
2. Dashboard → **Telegram** → paste the token → **Connect bot**. The app calls `getMe`,
   encrypts the token, and registers the webhook `APP_URL/api/telegram/webhook/<id>` with a
   random secret token.
3. Optional: set a **manager chat id** to receive lead / booking / handoff alerts in Telegram.

Without a bot, use **Use sandbox bot** and the **AI agent → Test chat** to exercise the
full pipeline.
