import { z } from "zod";
import { conversationStatusEnum } from "@/server/db/schema";
import { listConversations } from "@/server/domains/conversations";
import { route } from "@/server/http/api";

const listQuery = z.object({
  status: z.enum(conversationStatusEnum.enumValues).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = route({ permission: "crm:read" }, async ({ db, tenant, query }) => ({
  conversations: await listConversations(db, tenant, query(listQuery)),
}));
