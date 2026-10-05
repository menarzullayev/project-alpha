import { createKnowledge, knowledgeInputSchema, listKnowledge } from "@/server/domains/knowledge";
import { json, route } from "@/server/http/api";

export const GET = route({ permission: "crm:read" }, async ({ db, tenant }) => ({ articles: await listKnowledge(db, tenant) }));

export const POST = route({ permission: "knowledge:write" }, async ({ db, tenant, body }) =>
  json({ article: await createKnowledge(db, tenant, await body(knowledgeInputSchema)) }, { status: 201 }),
);
