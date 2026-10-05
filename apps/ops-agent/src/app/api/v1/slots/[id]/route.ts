import { deactivateSlot } from "@/server/domains/courses";
import { parseId, route } from "@/server/http/api";

export const DELETE = route<{ id: string }>({ permission: "catalog:write" }, async ({ db, tenant, params }) => ({
  slot: await deactivateSlot(db, tenant, parseId(params)),
}));
