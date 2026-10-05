import { Plus, Target } from "lucide-react";
import Link from "next/link";
import { FilterTabs } from "@/components/filter-tabs";
import { LEAD_LABELS, LeadStatusBadge } from "@/components/status";
import { ApiForm, InlineSelect, ModalButton } from "@/components/ui/interactive";
import { Card, EmptyState, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listCourses } from "@/server/domains/courses";
import { LEAD_STATUSES, type LeadStatus, listLeads } from "@/server/domains/leads";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const { tenant } = await requirePage("crm:read");
  const sp = await searchParams;
  const status = LEAD_STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const db = getDb();
  const [leads, courses] = await Promise.all([listLeads(db, tenant, { status, q, limit: 200 }), listCourses(db, tenant)]);
  const canWrite = can(tenant.role, "crm:write");

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Every Telegram conversation becomes a lead. Move them through the pipeline."
        actions={
          canWrite && (
            <ModalButton label={<><Plus className="h-4 w-4" /> Add lead</>} title="Add lead">
              
                <ApiForm
                  action="/api/v1/leads"
                  submitLabel="Create lead"
                  fields={{ fullName: "string", phone: "optional", interestedCourseId: "nullable", notes: "optional" }}
                >
                  <Field label="Full name" htmlFor="fullName">
                    <Input id="fullName" name="fullName" required />
                  </Field>
                  <Field label="Phone" htmlFor="phone">
                    <Input id="phone" name="phone" placeholder="+998 90 123 45 67" />
                  </Field>
                  <Field label="Interested in" htmlFor="course">
                    <Select id="course" name="interestedCourseId" defaultValue="">
                      <option value="">—</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Notes" htmlFor="notes">
                    <Textarea id="notes" name="notes" />
                  </Field>
                </ApiForm>
            </ModalButton>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs base="/leads" param="status" current={status} options={[{ label: "All" }, ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_LABELS[s] }))]} />
        <form className="flex gap-2" action="/leads">
          {status && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={q} placeholder="Search name, phone, @username" className="w-full lg:w-72" aria-label="Search leads" />
        </form>
      </div>
      <Card>
        {leads.length === 0 ? (
          <EmptyState icon={<Target className="h-5 w-5" />} title={q || status ? "No matching leads" : "No leads yet"} description="Leads appear automatically when customers message your Telegram bot." />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Customer</Th>
                <Th>Interested in</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Source</Th>
                <Th className="hidden md:table-cell">Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {l.customerName ?? (l.telegramUsername ? `@${l.telegramUsername}` : "Unknown")}
                    </Link>
                    <div className="text-xs text-slate-500">{l.customerPhone ?? (l.telegramUsername ? `@${l.telegramUsername}` : "—")}</div>
                  </Td>
                  <Td>{l.courseName ?? <span className="text-slate-400">—</span>}</Td>
                  <Td>
                    {canWrite ? (
                      <InlineSelect action={`/api/v1/leads/${l.id}`} field="status" value={l.status} label="Lead status" options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_LABELS[s] }))} />
                    ) : (
                      <LeadStatusBadge status={l.status} />
                    )}
                  </Td>
                  <Td className="hidden capitalize md:table-cell">{l.source.replace("_", " ")}</Td>
                  <Td className="hidden whitespace-nowrap text-slate-500 md:table-cell">{timeAgo(l.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
