import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, ReplyBox, Thread } from "@/components/conversations/thread";
import { ConversationStatusBadge } from "@/components/status";
import { ActionButton } from "@/components/ui/interactive";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getConversation } from "@/server/domains/conversations";
import { requirePage } from "@/server/http/page-auth";
import { AppError } from "@/server/lib/errors";
import { can } from "@/server/rbac";

const REASONS: Record<string, string> = {
  complaint: "Customer complaint",
  customer_requested_human: "Customer asked for a person",
  unable_to_answer: "Agent could not answer from approved knowledge",
  no_trial_slots: "No open trial slots for the requested course",
  no_courses_configured: "No courses configured",
  location_not_in_knowledge: "Location question not covered by knowledge base",
  operator_takeover: "Taken over by an operator",
};

export default async function ConversationPage({ params }: PageProps<"/conversations/[id]">) {
  const { tenant, session } = await requirePage("crm:read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getConversation(getDb(), tenant, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const { conversation: c, customer, messages } = data;
  const canReply = can(tenant.role, "conversations:reply");
  return (
    <div>
      <AutoRefresh />
      <Link href="/conversations" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Conversations
      </Link>
      <PageHeader
        title={customer.fullName ?? (customer.telegramUsername ? `@${customer.telegramUsername}` : "Customer")}
        description={`${c.channel === "web_test" ? "Test chat" : "Telegram"}${customer.phone ? ` · ${customer.phone}` : ""}`}
        actions={
          <>
            <ConversationStatusBadge status={c.status} />
            {canReply && c.status !== "handoff" && (
              <ActionButton action={`/api/v1/conversations/${c.id}`} method="PATCH" body={{ status: "handoff" }}>
                Take over
              </ActionButton>
            )}
            {canReply && c.status !== "bot" && (
              <ActionButton action={`/api/v1/conversations/${c.id}`} method="PATCH" body={{ status: "bot" }} variant="primary">
                Hand back to AI
              </ActionButton>
            )}
            {canReply && c.status !== "closed" && (
              <ActionButton action={`/api/v1/conversations/${c.id}`} method="PATCH" body={{ status: "closed" }} variant="ghost">
                Close
              </ActionButton>
            )}
          </>
        }
      />
      {c.status === "handoff" && (
        <div className="mb-4">
          <Alert tone="amber">
            The AI agent is paused for this chat. Reason: {REASONS[c.handoffReason ?? ""] ?? c.handoffReason ?? "—"}.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="max-h-[60vh] min-h-64 overflow-y-auto bg-slate-50 p-4 sm:p-5">
            <Thread
              timeZone={session.org!.timezone}
              messages={messages.map((m) => ({
                id: m.id,
                direction: m.direction,
                senderType: m.senderType,
                body: m.body,
                deliveryStatus: m.deliveryStatus,
                createdAt: m.createdAt.toISOString(),
                intent: m.meta?.intent ?? null,
              }))}
            />
          </div>
          {canReply && (
            <div className="border-t border-slate-100 p-4">
              <ReplyBox conversationId={c.id} status={c.status} />
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Customer" />
          <dl className="space-y-3 p-5 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">{customer.fullName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium">{customer.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Telegram</dt>
              <dd className="font-medium">{customer.telegramUsername ? `@${customer.telegramUsername}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Language</dt>
              <dd className="font-medium uppercase">{c.state.language ?? "—"}</dd>
            </div>
            <div>
              <Link href={`/customers/${customer.id}`} className="font-medium text-brand-600 hover:underline">
                Open customer profile →
              </Link>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
