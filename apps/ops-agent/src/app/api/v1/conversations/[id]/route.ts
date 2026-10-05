import { conversationStatusSchema, getConversation, setConversationStatus } from "@/server/domains/conversations";
import { parseId, route } from "@/server/http/api";

export const GET = route<{ id: string }>({ permission: "crm:read" }, async ({ db, tenant, params }) => getConversation(db, tenant, parseId(params)));

export const PATCH = route<{ id: string }>({ permission: "conversations:reply" }, async ({ db, tenant, params, body }) => ({
  conversation: await setConversationStatus(db, tenant, parseId(params), (await body(conversationStatusSchema)).status),
}));
