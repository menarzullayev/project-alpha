import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { revokeUserSessions } from "@/server/platform/users";

export const DELETE = rootRoute<{ id: string }>({ permission: "users:suspend" }, async ({ db, root, params }) => revokeUserSessions(db, root, parseId(params)));
