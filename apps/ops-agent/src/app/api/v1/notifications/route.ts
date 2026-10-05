import { listNotifications, unreadCount } from "@/server/domains/notifications";
import { route } from "@/server/http/api";

export const GET = route({ permission: "dashboard:read" }, async ({ db, tenant }) => ({
  notifications: await listNotifications(db, tenant),
  unread: await unreadCount(db, tenant),
}));
