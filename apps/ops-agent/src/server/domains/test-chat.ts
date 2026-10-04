import { and, eq } from "drizzle-orm";
import { processInbound } from "../agent/orchestrator";
import type { Db } from "../db/client";
import { conversations, customers } from "../db/schema";
import { getLlmProvider } from "../providers/llm";
import { SandboxMessagingProvider } from "../providers/messaging/sandbox";
import type { TenantContext } from "../tenancy";

/** The dashboard playground: the real pipeline, delivered to a sandbox. */
export async function sendTestMessage(db: Db, ctx: TenantContext, user: { id: string; name: string }, text: string, clientMessageId: string) {
  const chatId = `web:${user.id}`;
  return processInbound(
    db,
    {
      orgId: ctx.orgId,
      channel: "web_test",
      integrationId: null,
      chatId,
      from: { userId: chatId, fullName: `${user.name} (test)`, username: null },
      text,
      isStart: text.trim() === "/start",
      externalMessageId: clientMessageId,
    },
    { messaging: new SandboxMessagingProvider(), llm: getLlmProvider() },
  );
}

export async function resetTestChat(db: Db, ctx: TenantContext, userId: string) {
  const chatId = `web:${userId}`;
  await db.delete(conversations).where(and(eq(conversations.orgId, ctx.orgId), eq(conversations.channel, "web_test"), eq(conversations.externalChatId, chatId)));
  await db.delete(customers).where(and(eq(customers.orgId, ctx.orgId), eq(customers.telegramUserId, chatId)));
}
