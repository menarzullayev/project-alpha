import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Liveness + readiness: verifies configuration and a database round-trip. */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
  try {
    env();
    checks.config = { ok: true };
  } catch (err) {
    checks.config = { ok: false, error: (err as Error).message.split("\n")[0] };
  }
  if (checks.config.ok) {
    const t = Date.now();
    try {
      await getDb().execute(sql`select 1 from ops_agent.__migrations limit 1`);
      checks.database = { ok: true, ms: Date.now() - t };
    } catch (err) {
      checks.database = { ok: false, ms: Date.now() - t, error: (err as Error).message.slice(0, 200) };
    }
  }
  const ok = Object.values(checks).every((c) => c.ok);
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      llm: ok ? env().LLM_PROVIDER : undefined,
      checks,
      ms: Date.now() - started,
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
