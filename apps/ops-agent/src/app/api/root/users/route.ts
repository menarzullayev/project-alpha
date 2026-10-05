import { json } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { createUser, createUserSchema, listUsers, userListQuery } from "@/server/platform/users";

export const GET = rootRoute({ permission: "users:read" }, async ({ db, query }) => listUsers(db, query(userListQuery)));

export const POST = rootRoute({ permission: "users:write" }, async ({ db, root, body }) =>
  json(await createUser(db, root, await body(createUserSchema)), { status: 201 }),
);
