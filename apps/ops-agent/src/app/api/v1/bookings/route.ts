import { z } from "zod";
import { bookingCreateSchema, createBooking, listBookings } from "@/server/domains/bookings";
import { bookingStatusEnum } from "@/server/db/schema";
import { json, route } from "@/server/http/api";

const listQuery = z.object({
  status: z.enum(bookingStatusEnum.enumValues).optional(),
  upcoming: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = route({ permission: "crm:read" }, async ({ db, tenant, query }) => {
  const q = query(listQuery);
  return { bookings: await listBookings(db, tenant, { status: q.status, upcoming: q.upcoming === "true", limit: q.limit }) };
});

export const POST = route({ permission: "bookings:write" }, async ({ db, tenant, body }) => {
  const r = await createBooking(db, tenant, { ...(await body(bookingCreateSchema)), source: "manual" });
  return json(r, { status: r.created ? 201 : 200 });
});
