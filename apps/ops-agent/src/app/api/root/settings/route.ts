import { rootRoute } from "@/server/http/root-api";
import { recordPlatformAudit } from "@/server/platform/audit";
import { getPlatformSettings, platformSettingsSchema, updatePlatformSettings } from "@/server/platform/settings";

export const GET = rootRoute({ permission: "platform:read" }, async ({ db }) => ({ settings: await getPlatformSettings(db) }));

export const PATCH = rootRoute({ permission: "settings:write" }, async ({ db, root, body }) => {
  const patch = await body(platformSettingsSchema.partial());
  const before = await getPlatformSettings(db);
  const settings = await updatePlatformSettings(db, patch, root.userId);
  const changed = Object.fromEntries(Object.keys(patch).map((k) => [k, { from: before[k as keyof typeof before], to: settings[k as keyof typeof settings] }]));
  await recordPlatformAudit(db, root, { action: "settings.updated", targetType: "settings", metadata: changed });
  return { settings };
});
