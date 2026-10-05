import { getLead, leadUpdateSchema, updateLead } from "@/server/domains/leads";
import { parseId, route } from "@/server/http/api";

export const GET = route<{ id: string }>({ permission: "crm:read" }, async ({ db, tenant, params }) => ({ lead: await getLead(db, tenant, parseId(params)) }));

export const PATCH = route<{ id: string }>({ permission: "crm:write" }, async ({ db, tenant, params, body }) => ({
  lead: await updateLead(db, tenant, parseId(params), await body(leadUpdateSchema)),
}));
