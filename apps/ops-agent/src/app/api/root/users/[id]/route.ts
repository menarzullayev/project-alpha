import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { getUserDetail, updateUser, updateUserSchema } from "@/server/platform/users";

export const GET = rootRoute<{ id: string }>({ permission: "users:read" }, async ({ db, params }) => getUserDetail(db, parseId(params)));

export const PATCH = rootRoute<{ id: string }>({ permission: "users:write" }, async ({ db, root, params, body }) => ({
  user: await updateUser(db, root, parseId(params), await body(updateUserSchema)),
}));
