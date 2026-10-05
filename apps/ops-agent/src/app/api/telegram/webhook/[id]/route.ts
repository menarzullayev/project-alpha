import { getDb } from "@/server/db/client";
import { getIntegrationById } from "@/server/domains/integrations";
import { handleTelegramUpdate, telegramUpdateSchema } from "@/server/domains/telegram-webhook";
import { safeEqual } from "@/server/lib/crypto";
import { createLogger } from "@/server/lib/logger";
import { checkRateLimit } from "@/server/lib/rate-limit";
import { getLlmProvider } from "@/server/providers/llm";

export const maxDuration = 30;

const ok = () => Response.json({ ok: true });

/**
 * Telegram webhook. Authenticated by the per-integration secret Telegram
 * echoes in X-Telegram-Bot-Api-Secret-Token. Returns 200 for anything we will
 * never be able to process (so Telegram stops retrying) and 500 for transient
 * failures (so Telegram redelivers; processing is idempotent).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const log = createLogger({ service: "ops-agent", route: "telegram-webhook", integrationId: id });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not_found" }, { status: 404 });

  const db = getDb();
  const integration = await getIntegrationById(db, id);
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!integration || !safeEqual(secret, integration.webhookSecret)) {
    log.warn("webhook rejected: unknown integration or bad secret");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (integration.status !== "active") return ok();

  const rl = await checkRateLimit(db, `tg:${integration.id}`, 600, 60);
  if (!rl.allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = telegramUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("webhook payload rejected", { issues: parsed.error.issues.slice(0, 3) });
    return ok();
  }

  try {
    const outcome = await handleTelegramUpdate(db, integration, parsed.data, { llm: getLlmProvider() });
    return Response.json({ ok: true, status: outcome.status });
  } catch {
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
