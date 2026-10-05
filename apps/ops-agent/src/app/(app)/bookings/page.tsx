import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { FilterTabs } from "@/components/filter-tabs";
import { BOOKING_LABELS, BookingStatusBadge } from "@/components/status";
import { InlineSelect } from "@/components/ui/interactive";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listBookings } from "@/server/domains/bookings";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Bookings" };
const STATUSES = ["pending", "confirmed", "attended", "no_show", "cancelled"] as const;

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const { tenant, session } = await requirePage("crm:read");
  const sp = await searchParams;
  const view = sp.view === "all" ? "all" : "upcoming";
  const bookings = await listBookings(getDb(), tenant, { upcoming: view === "upcoming", limit: 300 });
  const tz = session.org!.timezone;
  const canWrite = can(tenant.role, "bookings:write");
  return (
    <div>
      <PageHeader title="Trial bookings" description="Trial lessons booked by the AI agent or your team." />
      <div className="mb-4">
        <FilterTabs base="/bookings" param="view" current={view === "all" ? "all" : undefined} options={[{ label: "Upcoming" }, { value: "all", label: "All bookings" }]} />
      </div>
      <Card>
        {bookings.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="h-5 w-5" />} title="No bookings" description="When customers book a trial lesson in Telegram, it shows up here." />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>When</Th>
                <Th>Customer</Th>
                <Th>Course</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Source</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bookings.map((b) => (
                <tr key={b.id} className={sp.highlight === b.id ? "bg-amber-50" : "hover:bg-slate-50"}>
                  <Td className="whitespace-nowrap font-medium text-slate-900">
                    {formatDateTime(b.startsAt, tz)}
                    {b.location && <div className="text-xs font-normal text-slate-500">{b.location}</div>}
                  </Td>
                  <Td>
                    <Link href={`/customers/${b.customerId}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {b.customerName ?? "Customer"}
                    </Link>
                    <div className="text-xs text-slate-500">{b.customerPhone ?? "—"}</div>
                  </Td>
                  <Td>{b.courseName}</Td>
                  <Td>
                    {canWrite ? (
                      <InlineSelect action={`/api/v1/bookings/${b.id}`} field="status" value={b.status} label="Booking status" options={STATUSES.map((s) => ({ value: s, label: BOOKING_LABELS[s] }))} />
                    ) : (
                      <BookingStatusBadge status={b.status} />
                    )}
                  </Td>
                  <Td className="hidden capitalize md:table-cell">{b.source.replace("_", " ")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
