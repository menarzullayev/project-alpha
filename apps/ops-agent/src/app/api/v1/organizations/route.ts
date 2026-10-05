import { z } from "zod";
import { createAdditionalOrganization } from "@/server/domains/auth";
import { json, route } from "@/server/http/api";

export const POST = route({ auth: "required", rateLimit: { key: "create-org", limit: 5, windowSec: 3600 } }, async ({ db, body, session }) => {
  const { name } = await body(z.object({ name: z.string().trim().min(2).max(120) }));
  const org = await createAdditionalOrganization(db, session!, name);
  return json({ organization: { id: org.id, name: org.name } }, { status: 201 });
});
