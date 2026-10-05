import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { integrations, notifications } from "../db/schema";
import { logger } from "../lib/logger";
import type { TenantContext } from "../tenancy";
import { messagingProviderFor } from "./integrations";

export type NotificationEvent = {
  type: "lead.created" | "booking.created" | "conversation.handoff" | "daily_report" | "message.delivery_failed";
  title: string;
  body?: string;
  link?: string;
};

/** A delivery channel for operator notifications. */
export interface NotificationChannel {
  readonly name: string;
  deliver(db: DbOrTx, orgId: string, event: NotificationEvent): Promise<void>;
}

/** Persists to the dashboard notification centre. */
export const inAppChannel: NotificationChannel = {
  name: "in_app",
  async deliver(db, orgId, event) {
    await db.insert(notifications).values({ orgId, type: event.type, title: event.title, body: event.body ?? "", link: event.link ?? null });
  },
};

/** Pushes to the manager chat configured on the org's Telegram integration. */
export const telegramManagerChannel: NotificationChannel = {
  name: "telegram_manager",
  async deliver(db, orgId, event) {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.orgId, orgId), eq(integrations.type, "telegram"), eq(integrations.status, "active")));
    if (!integration?.managerChatId) return;
    const provider = messagingProviderFor(integration);
    await provider.sendText(integration.managerChatId, `🔔 ${event.title}${event.body ? `\n\n${event.body}` : ""}`);
  },
};

const defaultChannels = [inAppChannel, telegramManagerChannel];

/**
 * Fan-out to every channel. The in-app record is written in the caller's
 * transaction; external channels must never fail the business operation.
 */
export async function notify(db: DbOrTx, orgId: string, event: NotificationEvent, channels = defaultChannels) {
  for (const ch of channels) {
    try {
      await ch.deliver(db, orgId, event);
    } catch (err) {
      if (ch === inAppChannel) throw err;
      logger.warn("notification channel failed", { channel: ch.name, orgId, type: event.type, err: (err as Error).message });
    }
  }
}

export async function listNotifications(db: DbOrTx, ctx: TenantContext, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.orgId, ctx.orgId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(limit, 200));
}

export async function unreadCount(db: DbOrTx, ctx: TenantContext) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.orgId, ctx.orgId), isNull(notifications.readAt)));
  return r.n;
}

export async function markAllRead(db: DbOrTx, ctx: TenantContext) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.orgId, ctx.orgId), isNull(notifications.readAt)));
}
