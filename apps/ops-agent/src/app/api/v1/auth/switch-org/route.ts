import { z } from "zod";
import { switchOrganization } from "@/server/domains/auth";
import { route } from "@/server/http/api";

export const POST = route({ auth: "required" }, async ({ db, body, session }) => {
  const { orgId } = await body(z.object({ orgId: z.string().uuid() }));
  await switchOrganization(db, session!, orgId);
  return { ok: true };
});
