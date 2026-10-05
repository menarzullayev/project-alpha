import { BookOpen, Pencil, Plus } from "lucide-react";
import { KnowledgeForm } from "@/components/catalog/forms";
import { ActionButton, ModalButton } from "@/components/ui/interactive";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listKnowledge } from "@/server/domains/knowledge";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";

export const metadata = { title: "Knowledge base" };

export default async function KnowledgePage() {
  const { tenant } = await requirePage("crm:read");
  const articles = await listKnowledge(getDb(), tenant);
  const canWrite = can(tenant.role, "knowledge:write");
  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="Approved answers are the only FAQ content the agent may send. Drafts are never used."
        actions={
          canWrite && (
            <ModalButton label={<><Plus className="h-4 w-4" /> New answer</>} title="New answer">
              <KnowledgeForm />
            </ModalButton>
          )
        }
      />
      <Card>
        {articles.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No answers yet" description="Add your address, payment methods, discounts and other common questions." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {articles.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-slate-900">{a.title}</h3>
                    <Badge tone={a.status === "approved" ? "green" : a.status === "draft" ? "amber" : "slate"}>{a.status}</Badge>
                    <Badge>{a.category}</Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>
                  {a.keywords.length > 0 && <p className="mt-1 text-xs text-slate-400">Keywords: {a.keywords.join(", ")}</p>}
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-2">
                    {a.status !== "approved" && (
                      <ActionButton action={`/api/v1/knowledge/${a.id}`} method="PATCH" body={{ status: "approved" }} variant="primary">
                        Approve
                      </ActionButton>
                    )}
                    <ModalButton variant="secondary" label={<Pencil className="h-4 w-4" aria-label="Edit" />} title="Edit answer">
                      <KnowledgeForm article={a} />
                    </ModalButton>
                    <ActionButton action={`/api/v1/knowledge/${a.id}`} method="DELETE" variant="danger" confirm="Delete this answer?">
                      Delete
                    </ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
