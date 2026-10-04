import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingStatusBadge, ConversationStatusBadge, LEAD_LABELS, LeadStatusBadge } from "@/components/status";
import { ApiForm } from "@/components/ui/interactive";
import { Card, CardHeader, EmptyState, Field, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listCourses } from "@/server/domains/courses";
import { getCustomerOverview } from "@/server/domains/customers";
import { getLead, LEAD_STATUSES } from "@/server/domains/leads";
import { listMembers } from "@/server/domains/team";
import { requirePage } from "@/server/http/page-auth";
import { AppError } from "@/server/lib/errors";
import { can } from "@/server/rbac";
import { formatDateTime } from "@/lib/format";

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { tenant, session } = await requirePage("crm:read");
  const { id } = await params;
  const db = getDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lead = await getLead(db, tenant, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const [overview, courses, members] = await Promise.all([getCustomerOverview(db, tenant, lead.customerId), listCourses(db, tenant), listMembers(db, tenant)]);
  const c = overview.customer;
  const tz = session.org!.timezone;
  const canWrite = can(tenant.role, "crm:write");

  return (
    <div>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Leads
      </Link>
      <PageHeader title={c.fullName ?? (c.telegramUsername ? `@${c.telegramUsername}` : "Lead")} description={`Created ${formatDateTime(lead.createdAt, tz)} · source: ${lead.source}`} actions={<LeadStatusBadge status={lead.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Pipeline" />
            <div className="p-5">
              {canWrite ? (
                <ApiForm
                  action={`/api/v1/leads/${lead.id}`}
                  method="PATCH"
                  successMessage="Lead updated"
                  fields={{ status: "string", interestedCourseId: "nullable", assignedTo: "nullable", notes: "nullable" }}
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Status" htmlFor="status">
                      <Select id="status" name="status" defaultValue={lead.status}>
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Interested in" htmlFor="course">
                      <Select id="course" name="interestedCourseId" defaultValue={lead.interestedCourseId ?? ""}>
                        <option value="">—</option>
                        {courses.map((co) => (
                          <option key={co.id} value={co.id}>
                            {co.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Assigned to" htmlFor="assignedTo">
                      <Select id="assignedTo" name="assignedTo" defaultValue={lead.assignedTo ?? ""}>
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Notes" htmlFor="notes">
                    <Textarea id="notes" name="notes" defaultValue={lead.notes ?? ""} />
                  </Field>
                </ApiForm>
              ) : (
                <p className="text-sm text-slate-600">{lead.notes || "No notes."}</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Conversations" />
            {overview.conversations.length === 0 ? (
              <EmptyState title="No conversations" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {overview.conversations.map((cv) => (
                  <li key={cv.id}>
                    <Link href={`/conversations/${cv.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                      <span className="capitalize text-slate-700">{cv.channel.replace("_", " ")} · {formatDateTime(cv.lastMessageAt, tz)}</span>
                      <ConversationStatusBadge status={cv.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <dl className="space-y-3 p-5 text-sm">
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-900">{c.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Telegram</dt>
                <dd className="font-medium text-slate-900">{c.telegramUsername ? `@${c.telegramUsername}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Customer profile</dt>
                <dd>
                  <Link href={`/customers/${c.id}`} className="font-medium text-brand-600 hover:underline">
                    Open
                  </Link>
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Bookings" />
            {overview.bookings.length === 0 ? (
              <EmptyState title="No bookings" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {overview.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-slate-700">{formatDateTime(b.createdAt, tz)}</span>
                    <BookingStatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
