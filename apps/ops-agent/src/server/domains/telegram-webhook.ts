import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { DeliveryError, processInbound, type ProcessResult } from "../agent/orchestrator";
import type { Db } from "../db/client";
import { webhookEvents } from "../db/schema";
import { logger } from "../lib/logger";
import type { LlmProvider } from "../providers/llm";
import type { MessagingProvider } from "../providers/messaging/types";
import { type Integration, messagingProviderFor } from "./integrations";

const userSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      date: z.number().optional(),
      chat: z.object({ id: z.number(), type: z.string() }),
      from: userSchema.optional(),
      text: z.string().max(10_000).optional(),
      contact: z.object({ phone_number: z.string(), user_id: z.number().optional() }).optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/** A processing claim older than this is treated as crashed and may be retried. */
const STALE_PROCESSING_MS = 60_000;

export type WebhookOutcome =
  | { status: "processed"; result: ProcessResult }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string };

/**
 * Claims the update (idempotency key = integration + update_id), processes it,
 * and records the outcome. Throws on failure so Telegram redelivers; a
 * redelivered update that already succeeded is acknowledged without work.
 */
export async function handleTelegramUpdate(
  db: Db,
  integration: Integration,
  update: TelegramUpdate,
  deps: { llm: LlmProvider | null; messaging?: MessagingProvider },
): Promise<WebhookOutcome> {
  const log = logger.child({ integrationId: integration.id, updateId: update.update_id });
  const externalId = String(update.update_id);

  const [claimed] = await db
    .insert(webhookEvents)
    .values({ orgId: integration.orgId, integrationId: integration.id, externalId, payload: update })
    .onConflictDoNothing({ target: [webhookEvents.integrationId, webhookEvents.externalId] })
    .returning();

  if (!claimed) {
    // Re-claim only failed or stale events, atomically, so two concurrent retries cannot both run.
    const [reclaimed] = await db
      .update(webhookEvents)
      .set({ status: "processing", attempts: sql`${webhookEvents.attempts} + 1`, receivedAt: new Date(), error: null })
      .where(
        and(
          eq(webhookEvents.integrationId, integration.id),
          eq(webhookEvents.externalId, externalId),
          sql`(${webhookEvents.status} = 'failed' or (${webhookEvents.status} = 'processing' and ${webhookEvents.receivedAt} < now() - make_interval(secs => ${STALE_PROCESSING_MS / 1000})))`,
        ),
      )
      .returning();
    if (!reclaimed) {
      log.info("duplicate webhook update acknowledged");
      return { status: "duplicate" };
    }
    log.info("retrying previously failed update", { attempts: reclaimed.attempts });
  }

  const finish = (status: "processed" | "failed" | "ignored", error?: string) =>
    db
      .update(webhookEvents)
      .set({ status, error: error ?? null, processedAt: new Date() })
      .where(and(eq(webhookEvents.integrationId, integration.id), eq(webhookEvents.externalId, externalId)));

  const m = update.message;
  const ignore = async (reason: string) => {
    await finish("ignored", reason);
    return { status: "ignored" as const, reason };
  };
  if (!m) return ignore("no_message");
  if (m.chat.type !== "private") return ignore("non_private_chat");
  if (!m.from || m.from.is_bot) return ignore("bot_or_anonymous_sender");
  const sharedPhone = m.contact && (!m.contact.user_id || m.contact.user_id === m.from.id) ? m.contact.phone_number : null;
  if (!m.text && !sharedPhone) return ignore("unsupported_message_type");

  const text = m.text ?? "";
  try {
    const result = await processInbound(
      db,
      {
        orgId: integration.orgId,
        channel: "telegram",
        integrationId: integration.id,
        chatId: String(m.chat.id),
        from: {
          userId: String(m.from.id),
          username: m.from.username ?? null,
          fullName: [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || null,
          language: m.from.language_code ?? null,
        },
        text: text.startsWith("/start") ? "" : text,
        isStart: text.startsWith("/start"),
        sharedPhone: sharedPhone ? (sharedPhone.startsWith("+") ? sharedPhone : `+${sharedPhone}`) : null,
        externalMessageId: String(m.message_id),
      },
      { llm: deps.llm, messaging: deps.messaging ?? messagingProviderFor(integration) },
    );
    await finish("processed");
    return { status: "processed", result };
  } catch (err) {
    log.error("webhook processing failed", { err: (err as Error).message, retryable: err instanceof DeliveryError });
    await finish("failed", (err as Error).message.slice(0, 500));
    throw err;
  }
}
