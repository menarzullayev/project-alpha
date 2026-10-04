import { z } from "zod";
import { sendTestMessage } from "@/server/domains/test-chat";
import { route } from "@/server/http/api";

export const POST = route({ permission: "crm:write", rateLimit: { key: "test-chat", limit: 60, windowSec: 60 } }, async ({ db, tenant, session, body }) => {
  const input = await body(z.object({ text: z.string().trim().min(1).max(2000), clientMessageId: z.string().uuid() }));
  const r = await sendTestMessage(db, tenant, session!.user, input.text, input.clientMessageId);
  return {
    conversationId: r.conversationId,
    reply: r.reply ?? null,
    duplicate: r.duplicate,
    intent: r.decision?.intent ?? null,
    confidence: r.decision?.confidence ?? null,
    actions: r.decision?.actions.map((a) => a.type) ?? [],
    quickReplies: r.decision?.quickReplies ?? [],
    handedOff: r.decision?.actions.some((a) => a.type === "handoff") ?? false,
  };
});
