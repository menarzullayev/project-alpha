import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { agentSettings } from "../db/schema";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export const agentSettingsSchema = z.object({
  agentName: z.string().trim().min(1).max(80).optional(),
  defaultLanguage: z.enum(["uz", "ru", "en"]).optional(),
  greeting: z.string().max(1000).optional(),
  tone: z.enum(["friendly", "formal", "concise"]).optional(),
  autoReplyEnabled: z.boolean().optional(),
  llmEnabled: z.boolean().optional(),
  escalationKeywords: z.array(z.string().trim().min(2).max(60)).max(50).optional(),
  maxUnknownBeforeHandoff: z.coerce.number().int().min(1).max(10).optional(),
  businessInfo: z.string().max(4000).optional(),
});

export type AgentSettings = typeof agentSettings.$inferSelect;

export async function getAgentSettings(db: DbOrTx, orgId: string): Promise<AgentSettings> {
  const [s] = await db.select().from(agentSettings).where(eq(agentSettings.orgId, orgId));
  if (s) return s;
  const [created] = await db.insert(agentSettings).values({ orgId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(agentSettings).where(eq(agentSettings.orgId, orgId)))[0];
}

export async function updateAgentSettings(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof agentSettingsSchema>) {
  await getAgentSettings(db, ctx.orgId);
  const [s] = await db
    .update(agentSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(agentSettings.orgId, ctx.orgId))
    .returning();
  await recordAudit(db, ctx, { action: "agent.settings_updated", entityType: "agent_settings", entityId: ctx.orgId, metadata: { fields: Object.keys(input) } });
  return s;
}
