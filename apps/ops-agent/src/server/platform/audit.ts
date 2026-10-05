import { and, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { platformAuditLogs } from "../db/schema";

export type RootActor = { userId: string; email: string; ip?: string | null; userAgent?: string | null };

export async function recordPlatformAudit(
  db: DbOrTx,
  actor: RootActor | null,
  entry: { action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown> },
) {
  await db.insert(platformAuditLogs).values({
    actorUserId: actor?.userId ?? null,
    actorEmail: actor?.email ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ip: actor?.ip ?? null,
    userAgent: actor?.userAgent?.slice(0, 300) ?? null,
  });
}

export type AuditQuery = { q?: string; action?: string; since?: Date; before?: Date; limit?: number };

export async function listPlatformAudit(db: DbOrTx, opts: AuditQuery = {}) {
  const filters: SQL[] = [];
  if (opts.action) filters.push(eq(platformAuditLogs.action, opts.action));
  if (opts.since) filters.push(gte(platformAuditLogs.createdAt, opts.since));
  if (opts.before) filters.push(lt(platformAuditLogs.createdAt, opts.before));
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(platformAuditLogs.actorEmail, q), ilike(platformAuditLogs.action, q), ilike(platformAuditLogs.targetId, q))!);
  }
  return db
    .select()
    .from(platformAuditLogs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(platformAuditLogs.createdAt))
    .limit(Math.min(opts.limit ?? 200, 5000));
}
