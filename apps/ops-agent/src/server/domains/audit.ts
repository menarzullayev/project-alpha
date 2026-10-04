import { and, desc, eq, lt } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { auditLogs } from "../db/schema";
import type { TenantContext } from "../tenancy";

export async function recordAudit(
  db: DbOrTx,
  ctx: TenantContext,
  entry: { action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown> },
) {
  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorType: ctx.actorType,
    actorId: ctx.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
    ip: ctx.ip ?? null,
  });
}

export async function listAudit(db: DbOrTx, ctx: TenantContext, opts: { limit?: number; before?: Date } = {}) {
  const where = opts.before
    ? and(eq(auditLogs.orgId, ctx.orgId), lt(auditLogs.createdAt, opts.before))
    : eq(auditLogs.orgId, ctx.orgId);
  return db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}
