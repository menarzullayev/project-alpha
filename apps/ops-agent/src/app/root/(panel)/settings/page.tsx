import { ApiForm } from "@/components/ui/interactive";
import { Alert, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { PLANS } from "@/server/platform/organizations";
import { canPlatform } from "@/server/platform/rbac";
import { getPlatformSettings } from "@/server/platform/settings";

export const metadata = { title: "System settings" };

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 dark:border-slate-600 dark:bg-slate-800" />
      <span>
        <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

export default async function RootSettings() {
  const { root } = await requireRoot("platform:read");
  const { t } = await getRootT();
  const s = await getPlatformSettings(getDb());
  const canWrite = canPlatform(root.role, "settings:write");

  return (
    <div className="max-w-3xl">
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />
      {!canWrite && <div className="mb-4"><Alert tone="amber">{t.settings.readOnly}</Alert></div>}
      <ApiForm
        action="/api/root/settings"
        method="PATCH"
        submitLabel={t.common.save}
        successMessage={t.common.saved}
        fields={{
          signupEnabled: "checkbox",
          maintenanceMessage: "string",
          maxOrganizationsPerUser: "number",
          defaultPlan: "string",
          sessionTtlDays: "number",
          rootMfaRequired: "checkbox",
          rootSessionMfaHours: "number",
        }}
      >
        <fieldset disabled={!canWrite} className="space-y-6">
          <Card>
            <CardHeader title={t.settings.sections.access} />
            <div className="space-y-4 p-5">
              <Toggle name="signupEnabled" label={t.settings.signupEnabled} hint={t.settings.signupHint} defaultChecked={s.signupEnabled} />
              <Field label={t.settings.maintenanceMessage} hint={t.settings.maintenanceHint} htmlFor="s-maint">
                <Textarea id="s-maint" name="maintenanceMessage" rows={2} maxLength={500} defaultValue={s.maintenanceMessage} />
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title={t.settings.sections.security} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><Toggle name="rootMfaRequired" label={t.settings.rootMfaRequired} defaultChecked={s.rootMfaRequired} /></div>
              <Field label={t.settings.rootMfaHours} htmlFor="s-mfah"><Input id="s-mfah" name="rootSessionMfaHours" type="number" min={1} max={72} defaultValue={s.rootSessionMfaHours} required /></Field>
              <Field label={t.settings.sessionTtl} htmlFor="s-ttl"><Input id="s-ttl" name="sessionTtlDays" type="number" min={1} max={90} defaultValue={s.sessionTtlDays} required /></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title={t.settings.sections.defaults} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t.settings.defaultPlan} htmlFor="s-plan">
                <Select id="s-plan" name="defaultPlan" defaultValue={s.defaultPlan}>
                  {PLANS.map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
                </Select>
              </Field>
              <Field label={t.settings.maxOrgs} htmlFor="s-maxorg"><Input id="s-maxorg" name="maxOrganizationsPerUser" type="number" min={1} max={100} defaultValue={s.maxOrganizationsPerUser} required /></Field>
            </div>
          </Card>
        </fieldset>
      </ApiForm>
    </div>
  );
}
