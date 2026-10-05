import { z } from "zod";
import { errors } from "@/server/lib/errors";
import { rootRoute } from "@/server/http/root-api";
import { removeMembership } from "@/server/platform/users";

const params = z.object({ id: z.string().uuid(), orgId: z.string().uuid() });

export const DELETE = rootRoute<{ id: string; orgId: string }>({ permission: "users:write" }, async ({ db, root, params: p }) => {
  const parsed = params.safeParse(p);
  if (!parsed.success) throw errors.notFound();
  await removeMembership(db, root, parsed.data.id, parsed.data.orgId);
  return { ok: true };
});
