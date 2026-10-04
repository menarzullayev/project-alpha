import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { errors } from "./errors";

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across
 * serverless instances. One atomic upsert per check.
 */
export async function checkRateLimit(
  db: DbOrTx,
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into ops_agent.rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when ops_agent.rate_limits.window_start < now() - make_interval(secs => ${windowSec})
                   then 1 else ops_agent.rate_limits.count + 1 end,
      window_start = case when ops_agent.rate_limits.window_start < now() - make_interval(secs => ${windowSec})
                   then now() else ops_agent.rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows[0];
  const count = Number(row.count);
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.max(1, Math.ceil(windowSec - elapsed)),
  };
}

export async function enforceRateLimit(db: DbOrTx, key: string, limit: number, windowSec: number) {
  const r = await checkRateLimit(db, key, limit, windowSec);
  if (!r.allowed) throw errors.rateLimited(r.retryAfterSec);
}
