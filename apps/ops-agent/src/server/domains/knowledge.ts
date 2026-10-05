import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { knowledgeArticles, knowledgeStatusEnum } from "../db/schema";
import { errors } from "../lib/errors";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export const knowledgeInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(2).max(8000),
  category: z.string().trim().max(60).default("faq"),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  status: z.enum(knowledgeStatusEnum.enumValues).default("draft"),
});

export async function listKnowledge(db: DbOrTx, ctx: TenantContext, opts: { approvedOnly?: boolean } = {}) {
  const filters = [eq(knowledgeArticles.orgId, ctx.orgId)];
  if (opts.approvedOnly) filters.push(eq(knowledgeArticles.status, "approved"));
  return db.select().from(knowledgeArticles).where(and(...filters)).orderBy(desc(knowledgeArticles.updatedAt));
}

export async function createKnowledge(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof knowledgeInputSchema>) {
  const [a] = await db.insert(knowledgeArticles).values({ ...input, orgId: ctx.orgId, createdBy: ctx.userId }).returning();
  await recordAudit(db, ctx, { action: "knowledge.created", entityType: "knowledge", entityId: a.id, metadata: { status: a.status } });
  return a;
}

export async function updateKnowledge(db: DbOrTx, ctx: TenantContext, id: string, input: Partial<z.infer<typeof knowledgeInputSchema>>) {
  const [a] = await db
    .update(knowledgeArticles)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.orgId, ctx.orgId)))
    .returning();
  if (!a) throw errors.notFound("Article");
  await recordAudit(db, ctx, {
    action: input.status === "approved" ? "knowledge.approved" : "knowledge.updated",
    entityType: "knowledge",
    entityId: id,
  });
  return a;
}

export async function deleteKnowledge(db: DbOrTx, ctx: TenantContext, id: string) {
  const [a] = await db
    .delete(knowledgeArticles)
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.orgId, ctx.orgId)))
    .returning({ id: knowledgeArticles.id });
  if (!a) throw errors.notFound("Article");
  await recordAudit(db, ctx, { action: "knowledge.deleted", entityType: "knowledge", entityId: id });
}
