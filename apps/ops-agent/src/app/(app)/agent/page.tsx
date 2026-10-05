import { ProviderBadge, TestChat } from "@/components/agent/test-chat";
import { ApiForm } from "@/components/ui/interactive";
import { Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getAgentSettings } from "@/server/domains/agent-settings";
import { env } from "@/server/env";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";

export const metadata = { title: "AI agent" };

export default async function AgentPage() {
  const { tenant } = await requirePage("crm:read");
  const s = await getAgentSettings(getDb(), tenant.orgId);
  const e = env();
  const llmActive = e.LLM_PROVIDER !== "rules" && Boolean(e.LLM_PROVIDER === "anthropic" ? e.ANTHROPIC_API_KEY : e.OPENAI_API_KEY);
  const canConfigure = can(tenant.role, "agent:configure");
  const canTest = can(tenant.role, "crm:write");
  return (
    <div>
      <PageHeader title="AI agent" description="How your agent talks to customers and when it hands over to your team." actions={<ProviderBadge provider={llmActive ? e.LLM_PROVIDER : "rules"} />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Behaviour" description="The agent answers only from your courses, slots and approved knowledge." />
          <div className="p-5">
            <ApiForm
              action="/api/v1/agent/settings"
              method="PATCH"
              successMessage="Agent settings saved"
              fields={{
                agentName: "string",
                defaultLanguage: "string",
                greeting: "string",
                tone: "string",
                autoReplyEnabled: "checkbox",
                llmEnabled: "checkbox",
                maxUnknownBeforeHandoff: "number",
                escalationKeywords: "list",
                businessInfo: "string",
              }}
            >
              <fieldset disabled={!canConfigure} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Agent name" htmlFor="agentName">
                    <Input id="agentName" name="agentName" defaultValue={s.agentName} required />
                  </Field>
                  <Field label="Default language" htmlFor="defaultLanguage">
                    <Select id="defaultLanguage" name="defaultLanguage" defaultValue={s.defaultLanguage}>
                      <option value="uz">O&apos;zbekcha</option>
                      <option value="ru">Русский</option>
                      <option value="en">English</option>
                    </Select>
                  </Field>
                  <Field label="Tone" htmlFor="tone">
                    <Select id="tone" name="tone" defaultValue={s.tone}>
                      <option value="friendly">Friendly</option>
                      <option value="formal">Formal</option>
                      <option value="concise">Concise</option>
                    </Select>
                  </Field>
                  <Field label="Unanswered questions before handoff" htmlFor="maxUnknownBeforeHandoff">
                    <Input id="maxUnknownBeforeHandoff" name="maxUnknownBeforeHandoff" type="number" min={1} max={10} defaultValue={s.maxUnknownBeforeHandoff} />
                  </Field>
                </div>
                <Field label="Custom greeting" htmlFor="greeting" hint="(optional; default greeting is multilingual)">
                  <Textarea id="greeting" name="greeting" defaultValue={s.greeting} rows={3} />
                </Field>
                <Field label="Escalation keywords" htmlFor="escalationKeywords" hint="(comma separated; any of these hands the chat to a human)">
                  <Textarea id="escalationKeywords" name="escalationKeywords" defaultValue={s.escalationKeywords.join(", ")} rows={2} />
                </Field>
                <Field label="Business notes" htmlFor="businessInfo" hint="(internal context for LLM mode)">
                  <Textarea id="businessInfo" name="businessInfo" defaultValue={s.businessInfo} rows={2} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="autoReplyEnabled" defaultChecked={s.autoReplyEnabled} className="h-4 w-4 rounded border-slate-300" />
                  Auto-reply to customers (turn off to answer everything manually)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="llmEnabled" defaultChecked={s.llmEnabled} className="h-4 w-4 rounded border-slate-300" />
                  Use the LLM for questions the rules engine can&apos;t answer {llmActive ? "" : "(no LLM key configured on this deployment)"}
                </label>
              </fieldset>
            </ApiForm>
          </div>
        </Card>
        {canTest && (
          <Card>
            <TestChat />
          </Card>
        )}
      </div>
    </div>
  );
}
