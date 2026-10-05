import { markAllRead } from "@/server/domains/notifications";
import { route } from "@/server/http/api";

export const POST = route({ permission: "dashboard:read" }, async ({ db, tenant }) => {
  await markAllRead(db, tenant);
  return { ok: true };
});
