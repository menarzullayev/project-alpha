import { z } from "zod";
import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { setOrganizationStatus } from "@/server/platform/organizations";

const schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("suspended"), reason: z.string().trim().min(3).max(500) }),
  z.object({ status: z.literal("active") }),
]);

export const POST = rootRoute<{ id: string }>({ permission: "orgs:suspend" }, async ({ db, root, params, body }) => {
  const input = await body(schema);
  return { organization: await setOrganizationStatus(db, root, parseId(params), input.status, input.status === "suspended" ? input.reason : undefined) };
});
