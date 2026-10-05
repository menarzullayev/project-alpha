# Operations runbook

## Health & logs

- `GET /api/health` → 200 `{"status":"ok"}`; 503 with `checks.config` / `checks.database` details otherwise.
- Logs are single-line JSON (`ts, level, msg, requestId, path, status, ms, orgId…`); secrets are
  redacted by key name. Vercel → Project → Logs, filter by `requestId` from the `x-request-id` header.

## Common incidents

| Symptom | Check | Action |
| --- | --- | --- |
| Health 503, `database` failing | Supabase status; `DATABASE_URL`; pooler host/port; role password | Fix env and redeploy; ensure `ops_agent_app` exists and can log in |
| Customers get no replies | Dashboard → Telegram: status / last error; conversation in **Needs human**?; `autoReplyEnabled` | Re-enter bot token (re-registers webhook); hand conversation back to AI |
| Telegram shows "Wrong response from the webhook" | Logs for `/api/telegram/webhook` 401/500 | 401: the bot was re-connected elsewhere — reconnect here. 500: see error, Telegram retries automatically |
| `message.delivery_failed` notifications | Message error text (blocked by user, 403/400 from Telegram) | Bot blocked by the user — nothing to fix; otherwise check token |
| Many handoffs `unable_to_answer` | Conversations page → read questions | Add approved knowledge answers / course keywords |
| Booking "slot is full" | Courses page → slot shows N/N | Add slots or raise capacity |
| 429 on login/sign-up | Rate limits (`rate_limits` table) | Wait for the window; tune `SIGNUP_RATE_LIMIT` |
| Daily report missing | Vercel → Cron Jobs; `CRON_SECRET` set | Trigger manually: `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/daily-report` |

## Routine tasks

- **Migrations**: run automatically before each Vercel build. Manual: `MIGRATION_DATABASE_URL=… npm run db:migrate`.
- **Rotate `CRON_SECRET`**: update env, redeploy.
- **Rotate `ENCRYPTION_KEY`**: bot tokens become unreadable — each workspace must reconnect its bot.
- **Rotate DB password**: `ALTER ROLE ops_agent_app PASSWORD '…'`, update both URLs, redeploy.
- **Retry failed webhook events**: Telegram redelivers failed updates automatically; inspect with
  `select status, error, attempts from ops_agent.webhook_events where status = 'failed' order by received_at desc;`
- **Housekeeping** (monthly): `delete from ops_agent.rate_limits where window_start < now() - interval '1 day';`
  `delete from ops_agent.sessions where expires_at < now();`
- **Remove a workspace**: `delete from ops_agent.organizations where id = '…'` (cascades all tenant data).

## Backups

Supabase takes daily backups of the project. For a logical backup of this app only:
`pg_dump --schema=ops_agent "$MIGRATION_DATABASE_URL" > opsagent.sql`.
