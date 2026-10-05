import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { endAnnouncement } from "@/server/platform/announcements";

export const DELETE = rootRoute<{ id: string }>({ permission: "announcements:write" }, async ({ db, root, params }) => ({
  announcement: await endAnnouncement(db, root, parseId(params)),
}));
