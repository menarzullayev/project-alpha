import { CheckCircle2, Send } from "lucide-react";
import { ActionButton, ApiForm } from "@/components/ui/interactive";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getTelegramIntegration, publicIntegration } from "@/server/domains/integrations";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";

export const metadata = { title: "Telegram" };

export default async function IntegrationsPage() {
  const { tenant } = await requirePage("crm:read");
  const raw = await getTelegramIntegration(getDb(), tenant);
  const i = raw ? publicIntegration(raw) : null;
  const canManage = can(tenant.role, "integrations:manage");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Telegram bot" description="Connect your centre's Telegram bot. Each workspace uses its own bot." />
      <Card className="mb-6">
        <CardHeader
          title={i ? i.name : "Not connected"}
          description={i ? (i.mode === "sandbox" ? "Sandbox: replies are stored but not sent to Telegram." : `Webhook: ${i.webhookUrl}`) : "Your agent can't receive Telegram messages yet."}
          action={i && <Badge tone={i.status === "active" ? "green" : i.status === "error" ? "red" : "slate"}>{i.mode === "sandbox" ? "sandbox" : i.status}</Badge>}
        />
        <div className="space-y-5 p-5">
          {i?.lastError && <Alert>Last error: {i.lastError}</Alert>}
          {i && i.mode === "live" && i.status === "active" && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Connected — messages to @{i.botUsername} are answered by your agent.
            </p>
          )}
          {canManage ? (
            <>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">{i?.mode === "live" ? "Replace bot token" : "Connect a bot"}</h3>
                <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
                  <li>Open @BotFather in Telegram and send /newbot (or pick an existing bot).</li>
                  <li>Copy the API token it gives you and paste it below.</li>
                  <li>We verify the token and register the webhook automatically.</li>
                </ol>
                <ApiForm action="/api/v1/integrations/telegram" submitLabel="Connect bot" successMessage="Bot connected and webhook registered" fields={{ botToken: "string" }}>
                  <Field label="Bot token" htmlFor="botToken">
                    <Input id="botToken" name="botToken" required autoComplete="off" placeholder="1234567890:AA…" />
                  </Field>
                </ApiForm>
                <p className="mt-2 text-xs text-slate-500">The token is encrypted at rest (AES-256-GCM) and never shown again.</p>
              </div>
              {i && (
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="mb-1 text-sm font-semibold text-slate-900">Manager notifications</h3>
                  <p className="mb-3 text-sm text-slate-600">
                    New leads, bookings and handoffs are also sent to this Telegram chat. Send any message to your bot from the manager&apos;s account, then use that
                    chat&apos;s numeric id (e.g. from @userinfobot).
                  </p>
                  <ApiForm
                    action="/api/v1/integrations/telegram"
                    method="PATCH"
                    successMessage="Saved"
                    fields={{ managerChatId: "nullable" }}
                  >
                    <Field label="Manager chat id" htmlFor="managerChatId">
                      <Input id="managerChatId" name="managerChatId" defaultValue={i.managerChatId ?? ""} placeholder="123456789" inputMode="numeric" />
                    </Field>
                  </ApiForm>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
                {!i && (
                  <ActionButton action="/api/v1/integrations/telegram/sandbox" size="md">
                    <Send className="h-4 w-4" /> Use sandbox bot
                  </ActionButton>
                )}
                {i && (
                  <ActionButton action="/api/v1/integrations/telegram" method="DELETE" variant="danger" size="md" confirm="Disconnect the bot? Customers will stop receiving replies.">
                    Disconnect
                  </ActionButton>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Only admins can change the Telegram connection.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
