import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { integrations } from "../db/schema";
import { env } from "../env";
import { decryptSecret, encryptSecret, randomToken } from "../lib/crypto";
import { errors } from "../lib/errors";
import { logger } from "../lib/logger";
import type { FetchLike } from "../providers/http";
import { SandboxMessagingProvider } from "../providers/messaging/sandbox";
import { TelegramClient, TelegramMessagingProvider } from "../providers/messaging/telegram";
import type { MessagingProvider } from "../providers/messaging/types";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export type Integration = typeof integrations.$inferSelect;

export const connectTelegramSchema = z.object({
  botToken: z
    .string()
    .trim()
    .regex(/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/, "This does not look like a Telegram bot token"),
});

export const integrationUpdateSchema = z.object({
  managerChatId: z
    .string()
    .trim()
    .regex(/^-?\d{3,20}$/, "Chat id must be numeric")
    .nullable()
    .optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

/** Overridable in tests to stub the Telegram API. */
let telegramFetch: FetchLike | undefined;
export function setTelegramFetchForTests(f: FetchLike | undefined) {
  telegramFetch = f;
}

export function telegramClientFor(integration: Integration): TelegramClient | null {
  if (integration.mode !== "live" || !integration.secretEncrypted) return null;
  return new TelegramClient(decryptSecret(integration.secretEncrypted), telegramFetch ?? fetch);
}

export function messagingProviderFor(integration: Integration | null): MessagingProvider {
  const client = integration ? telegramClientFor(integration) : null;
  return client ? new TelegramMessagingProvider(client) : new SandboxMessagingProvider();
}

export function webhookUrlFor(integrationId: string) {
  return `${env().APP_URL.replace(/\/$/, "")}/api/telegram/webhook/${integrationId}`;
}

/** Public view: never exposes the encrypted token or webhook secret. */
export function publicIntegration(i: Integration) {
  return {
    id: i.id,
    type: i.type,
    status: i.status,
    mode: i.mode,
    name: i.name,
    botUsername: (i.config.botUsername as string | undefined) ?? null,
    managerChatId: i.managerChatId,
    lastError: i.lastError,
    webhookUrl: webhookUrlFor(i.id),
    createdAt: i.createdAt,
  };
}

export async function getTelegramIntegration(db: DbOrTx, ctx: TenantContext) {
  const [i] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.orgId, ctx.orgId), eq(integrations.type, "telegram")));
  return i ?? null;
}

/** Webhook lookup: by id only (the secret header is verified by the caller). */
export async function getIntegrationById(db: DbOrTx, id: string) {
  const [i] = await db.select().from(integrations).where(eq(integrations.id, id));
  return i ?? null;
}

export async function connectTelegram(db: DbOrTx, ctx: TenantContext, botToken: string) {
  const client = new TelegramClient(botToken, telegramFetch ?? fetch);
  let me: { id: number; username: string };
  try {
    me = await client.getMe();
  } catch (err) {
    logger.warn("telegram getMe failed", { orgId: ctx.orgId, err: (err as Error).message });
    throw errors.badRequest("Telegram rejected this bot token. Check it in @BotFather and try again.");
  }
  const webhookSecret = randomToken(32);
  const [integration] = await db
    .insert(integrations)
    .values({
      orgId: ctx.orgId,
      type: "telegram",
      mode: "live",
      status: "active",
      name: `@${me.username}`,
      config: { botUsername: me.username, botId: me.id },
      secretEncrypted: encryptSecret(botToken),
      webhookSecret,
    })
    .onConflictDoUpdate({
      target: [integrations.orgId, integrations.type],
      set: {
        mode: "live",
        status: "active",
        name: `@${me.username}`,
        config: { botUsername: me.username, botId: me.id },
        secretEncrypted: encryptSecret(botToken),
        webhookSecret,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  try {
    await client.setWebhook(webhookUrlFor(integration.id), webhookSecret);
  } catch (err) {
    await db
      .update(integrations)
      .set({ status: "error", lastError: (err as Error).message })
      .where(eq(integrations.id, integration.id));
    throw errors.badRequest(`Bot verified, but registering the webhook failed: ${(err as Error).message}`);
  }
  await recordAudit(db, ctx, {
    action: "integration.connected",
    entityType: "integration",
    entityId: integration.id,
    metadata: { type: "telegram", bot: me.username },
  });
  return integration;
}

/** A sandbox bot: lets a workspace exercise the full pipeline without a real Telegram bot. */
export async function createSandboxIntegration(db: DbOrTx, ctx: TenantContext) {
  const [integration] = await db
    .insert(integrations)
    .values({
      orgId: ctx.orgId,
      type: "telegram",
      mode: "sandbox",
      status: "active",
      name: "Sandbox bot",
      config: { botUsername: "sandbox_bot" },
      webhookSecret: randomToken(32),
    })
    .onConflictDoNothing({ target: [integrations.orgId, integrations.type] })
    .returning();
  return integration ?? (await getTelegramIntegration(db, ctx));
}

export async function updateIntegration(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof integrationUpdateSchema>) {
  const current = await getTelegramIntegration(db, ctx);
  if (!current) throw errors.notFound("Integration");
  const [i] = await db
    .update(integrations)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(integrations.id, current.id), eq(integrations.orgId, ctx.orgId)))
    .returning();
  await recordAudit(db, ctx, { action: "integration.updated", entityType: "integration", entityId: i.id, metadata: input });
  return i;
}

export async function disconnectTelegram(db: DbOrTx, ctx: TenantContext) {
  const current = await getTelegramIntegration(db, ctx);
  if (!current) throw errors.notFound("Integration");
  const client = telegramClientFor(current);
  if (client) {
    await client.deleteWebhook().catch((err) => logger.warn("deleteWebhook failed", { err: (err as Error).message }));
  }
  await db.delete(integrations).where(and(eq(integrations.id, current.id), eq(integrations.orgId, ctx.orgId)));
  await recordAudit(db, ctx, { action: "integration.disconnected", entityType: "integration", entityId: current.id });
}
