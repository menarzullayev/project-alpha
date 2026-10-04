import { createSlot, listSlots, slotInputSchema } from "@/server/domains/courses";
import { json, parseId, route } from "@/server/http/api";

export const GET = route<{ id: string }>({ permission: "crm:read" }, async ({ db, tenant, params }) => ({
  slots: await listSlots(db, tenant, { courseId: parseId(params) }),
}));

export const POST = route<{ id: string }>({ permission: "catalog:write" }, async ({ db, tenant, params, body }) =>
  json({ slot: await createSlot(db, tenant, parseId(params), await body(slotInputSchema)) }, { status: 201 }),
);
