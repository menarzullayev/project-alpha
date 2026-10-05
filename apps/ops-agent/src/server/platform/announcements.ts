import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { announcementSeverityEnum, announcements } from "../db/schema";
import { errors } from "../lib/errors";
import type { Role } from "../rbac";
import { recordPlatformAudit } from "./audit";
import type { RootContext } from "./context";

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().max(2000).default(""),
    severity: z.enum(announcementSeverityEnum.enumValues).default("info"),
    audience: z.enum(["all", "owners"]).default("all"),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((a) => !a.endsAt || !a.startsAt || a.endsAt > a.startsAt, { message: "End must be after start", path: ["endsAt"] });

export async function listAnnouncements(db: DbOrTx) {
  return db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(200);
}

export async function createAnnouncement(db: DbOrTx, ctx: RootContext, input: z.infer<typeof announcementSchema>) {
  const [a] = await db
    .insert(announcements)
    .values({ ...input, startsAt: input.startsAt ?? new Date(), endsAt: input.endsAt ?? null, createdBy: ctx.userId })
    .returning();
  await recordPlatformAudit(db, ctx, { action: "announcement.created", targetType: "announcement", targetId: a.id, metadata: { title: a.title, severity: a.severity, audience: a.audience } });
  return a;
}

/** Ends an announcement now (kept for history). */
export async function endAnnouncement(db: DbOrTx, ctx: RootContext, id: string) {
  const [a] = await db.update(announcements).set({ endsAt: new Date() }).where(eq(announcements.id, id)).returning();
  if (!a) throw errors.notFound("Announcement");
  await recordPlatformAudit(db, ctx, { action: "announcement.ended", targetType: "announcement", targetId: id });
  return a;
}

/** Announcements currently visible to a workspace member with the given role. */
export async function activeAnnouncementsFor(db: DbOrTx, role: Role) {
  const now = new Date();
  const rows = await db
    .select()
    .from(announcements)
    .where(and(lte(announcements.startsAt, now), or(isNull(announcements.endsAt), gt(announcements.endsAt, now))))
    .orderBy(desc(announcements.createdAt))
    .limit(5);
  return rows.filter((a) => a.audience === "all" || role === "owner");
}
