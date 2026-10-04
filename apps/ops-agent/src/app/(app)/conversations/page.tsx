import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { FilterTabs } from "@/components/filter-tabs";
import { ConversationStatusBadge } from "@/components/status";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { type ConversationStatus, listConversations } from "@/server/domains/conversations";
import { requirePage } from "@/server/http/page-auth";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Conversations" };

export default async function ConversationsPage({ searchParams }: PageProps<"/conversations">) {
  const { tenant } = await requirePage("crm:read");
  const sp = await searchParams;
  const status = ["bot", "handoff", "closed"].includes(sp.status as string) ? (sp.status as ConversationStatus) : undefined;
  const items = await listConversations(getDb(), tenant, { status, limit: 200 });
  return (
    <div>
      <PageHeader title="Conversations" description="Live Telegram chats handled by your AI agent and team." />
      <div className="mb-4">
        <FilterTabs
          base="/conversations"
          param="status"
          current={status}
          options={[{ label: "All" }, { value: "handoff", label: "Needs human" }, { value: "bot", label: "AI agent" }, { value: "closed", label: "Closed" }]}
        />
      </div>
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<MessagesSquare className="h-5 w-5" />} title="No conversations" description="Connect your Telegram bot or use the test chat on the AI agent page." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`/conversations/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <Avatar name={c.customerName ?? c.telegramUsername} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{c.customerName ?? (c.telegramUsername ? `@${c.telegramUsername}` : "Customer")}</p>
                      {c.channel === "web_test" && <Badge>test</Badge>}
                    </div>
                    <p className="truncate text-sm text-slate-500">{c.lastMessage ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">{timeAgo(c.lastMessageAt)}</span>
                    <ConversationStatusBadge status={c.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
