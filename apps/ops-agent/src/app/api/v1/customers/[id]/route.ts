import { customerInputSchema, getCustomerOverview, updateCustomer } from "@/server/domains/customers";
import { parseId, route } from "@/server/http/api";

export const GET = route<{ id: string }>({ permission: "crm:read" }, async ({ db, tenant, params }) => getCustomerOverview(db, tenant, parseId(params)));

export const PATCH = route<{ id: string }>({ permission: "crm:write" }, async ({ db, tenant, params, body }) => ({
  customer: await updateCustomer(db, tenant, parseId(params), await body(customerInputSchema)),
}));
