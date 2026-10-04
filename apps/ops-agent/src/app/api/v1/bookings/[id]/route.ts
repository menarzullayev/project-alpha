import { bookingStatusSchema, updateBookingStatus } from "@/server/domains/bookings";
import { parseId, route } from "@/server/http/api";

export const PATCH = route<{ id: string }>({ permission: "bookings:write" }, async ({ db, tenant, params, body }) => ({
  booking: await updateBookingStatus(db, tenant, parseId(params), (await body(bookingStatusSchema)).status),
}));
