import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingStatusBadge, ConversationStatusBadge, LeadStatusBadge } from "@/components/status";
import { ApiForm } from "@/components/ui/interactive";
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getCustomerOverview } from "@/server/domains/customers";
import { requirePage } from "@/server/http/page-auth";
import { AppError } from "@/server/lib/errors";
import { can } from "@/server/rbac";
import { formatDateTime } from "@/lib/format";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { tenant, session } = await requirePage("crm:read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const o = await getCustomerOverview(getDb(), tenant, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const tz = session.org!.timezone;
  const c = o.customer;
  return (
    <div>
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>
      <PageHeader title={c.fullName ?? "Customer"} description={c.telegramUsername ? `@${c.telegramUsername} on Telegram` : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Profile" />
          <div className="p-5">
            {can(tenant.role, "crm:write") ? (
              <ApiForm
                action={`/api/v1/customers/${c.id}`}
                method="PATCH"
                successMessage="Saved"
                fields={{ fullName: "nullable", phone: "nullable", notes: "nullable" }}
              >
                <Field label="Full name" htmlFor="fullName">
                  <Input id="fullName" name="fullName" defaultValue={c.fullName ?? ""} />
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <Input id="phone" name="phone" defaultValue={c.phone ?? ""} />
                </Field>
                <Field label="Notes" htmlFor="notes">
                  <Textarea id="notes" name="notes" defaultValue={c.notes ?? ""} />
                </Field>
              </ApiForm>
            ) : (
              <p className="text-sm text-slate-600">{c.phone ?? "No phone"}</p>
            )}
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Leads" />
            {o.leads.length === 0 ? (
              <EmptyState title="No leads" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {o.leads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                      <span>{formatDateTime(l.createdAt, tz)}</span>
                      <LeadStatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Conversations" />
            {o.conversations.length === 0 ? (
              <EmptyState title="No conversations" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {o.conversations.map((cv) => (
                  <li key={cv.id}>
                    <Link href={`/conversations/${cv.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                      <span>{formatDateTime(cv.lastMessageAt, tz)}</span>
                      <ConversationStatusBadge status={cv.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Bookings" />
            {o.bookings.length === 0 ? (
              <EmptyState title="No bookings" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {o.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{formatDateTime(b.createdAt, tz)}</span>
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
