import { ScrollText } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listAudit } from "@/server/domains/audit";
import { listMembers } from "@/server/domains/team";
import { requirePage } from "@/server/http/page-auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const { tenant, session } = await requirePage("audit:read");
  const db = getDb();
  const [entries, members] = await Promise.all([listAudit(db, tenant, { limit: 300 }), listMembers(db, tenant)]);
  const names = new Map(members.map((m) => [m.userId, m.name]));
  return (
    <div>
      <PageHeader title="Audit log" description="Every change made by your team and the AI agent." />
      <Card>
        {entries.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No activity yet" />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Time</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th className="hidden lg:table-cell">Details</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt, session.org!.timezone)}</Td>
                  <Td>{e.actorType === "user" ? (names.get(e.actorId ?? "") ?? "Former member") : <Badge tone="indigo">{e.actorType === "agent" ? "AI agent" : "System"}</Badge>}</Td>
                  <Td className="font-mono text-xs">{e.action}</Td>
                  <Td className="hidden max-w-md truncate font-mono text-xs text-slate-500 lg:table-cell">{Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
