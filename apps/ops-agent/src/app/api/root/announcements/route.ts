import { json } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { announcementSchema, createAnnouncement, listAnnouncements } from "@/server/platform/announcements";

export const GET = rootRoute({ permission: "platform:read" }, async ({ db }) => ({ announcements: await listAnnouncements(db) }));

export const POST = rootRoute({ permission: "announcements:write" }, async ({ db, root, body }) =>
  json({ announcement: await createAnnouncement(db, root, await body(announcementSchema)) }, { status: 201 }),
);
