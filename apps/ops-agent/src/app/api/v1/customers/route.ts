import { z } from "zod";
import { createCustomer, customerInputSchema, listCustomers } from "@/server/domains/customers";
import { json, route } from "@/server/http/api";

const listQuery = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = route({ permission: "crm:read" }, async ({ db, tenant, query }) => ({ customers: await listCustomers(db, tenant, query(listQuery)) }));

export const POST = route({ permission: "crm:write" }, async ({ db, tenant, body }) =>
  json({ customer: await createCustomer(db, tenant, await body(customerInputSchema)) }, { status: 201 }),
);
