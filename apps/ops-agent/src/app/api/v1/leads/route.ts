import { z } from "zod";
import { createManualLead, LEAD_STATUSES, leadCreateSchema, listLeads } from "@/server/domains/leads";
import { json, route } from "@/server/http/api";

const listQuery = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = route({ permission: "crm:read" }, async ({ db, tenant, query }) => ({ leads: await listLeads(db, tenant, query(listQuery)) }));

export const POST = route({ permission: "crm:write" }, async ({ db, tenant, body }) =>
  json({ lead: await createManualLead(db, tenant, await body(leadCreateSchema)) }, { status: 201 }),
);
