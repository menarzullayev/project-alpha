import { Users } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listCustomers } from "@/server/domains/customers";
import { requirePage } from "@/server/http/page-auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const { tenant, session } = await requirePage("crm:read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const customers = await listCustomers(getDb(), tenant, { q, limit: 200 });
  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has contacted your centre." />
      <form className="mb-4" action="/customers">
        <Input name="q" defaultValue={q} placeholder="Search name, phone, @username" className="w-full sm:w-80" aria-label="Search customers" />
      </form>
      <Card>
        {customers.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={q ? "No matching customers" : "No customers yet"} description="Customers are created automatically from Telegram conversations." />
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th className="hidden sm:table-cell">Telegram</Th>
                <Th className="hidden md:table-cell">First contact</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {c.fullName ?? "Unknown"}
                    </Link>
                  </Td>
                  <Td>{c.phone ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="hidden sm:table-cell">{c.telegramUsername ? `@${c.telegramUsername}` : "—"}</Td>
                  <Td className="hidden text-slate-500 md:table-cell">{formatDate(c.createdAt, session.org!.timezone)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
