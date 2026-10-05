import { deleteKnowledge, knowledgeInputSchema, updateKnowledge } from "@/server/domains/knowledge";
import { parseId, route } from "@/server/http/api";

export const PATCH = route<{ id: string }>({ permission: "knowledge:write" }, async ({ db, tenant, params, body }) => ({
  article: await updateKnowledge(db, tenant, parseId(params), await body(knowledgeInputSchema.partial())),
}));

export const DELETE = route<{ id: string }>({ permission: "knowledge:write" }, async ({ db, tenant, params }) => {
  await deleteKnowledge(db, tenant, parseId(params));
  return { ok: true };
});
