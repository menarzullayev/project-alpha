import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { platformSettings } from "../db/schema";

/** Typed platform settings with defaults. Stored as one row per key. */
export const platformSettingsSchema = z.object({
  signupEnabled: z.boolean(),
  maintenanceMessage: z.string().max(500),
  maxOrganizationsPerUser: z.number().int().min(1).max(100),
  defaultPlan: z.enum(["free", "pro", "enterprise"]),
  sessionTtlDays: z.number().int().min(1).max(90),
  rootMfaRequired: z.boolean(),
  rootSessionMfaHours: z.number().int().min(1).max(72),
});

export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  signupEnabled: true,
  maintenanceMessage: "",
  maxOrganizationsPerUser: 5,
  defaultPlan: "free",
  sessionTtlDays: 14,
  rootMfaRequired: true,
  rootSessionMfaHours: 12,
};

export async function getPlatformSettings(db: DbOrTx): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  const parsed = platformSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updatePlatformSettings(db: DbOrTx, patch: Partial<PlatformSettings>, userId: string | null) {
  const valid = platformSettingsSchema.partial().parse(patch);
  for (const [key, value] of Object.entries(valid)) {
    await db
      .insert(platformSettings)
      .values({ key, value, updatedBy: userId })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  }
  return getPlatformSettings(db);
}

export async function getSetting<K extends keyof PlatformSettings>(db: DbOrTx, key: K): Promise<PlatformSettings[K]> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
  const parsed = platformSettingsSchema.shape[key].safeParse(row?.value);
  return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as PlatformSettings[K];
}
