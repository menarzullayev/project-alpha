import { ApiForm } from "@/components/ui/interactive";
import { Card, CardHeader, Field, Input, PageHeader } from "@/components/ui/primitives";
import { CreateOrgForm } from "@/components/auth/auth-forms";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { session, tenant } = await requirePage("dashboard:read");
  const org = session.org!;
  const canManage = can(tenant.role, "org:manage");
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader title="Workspace" description={canManage ? "Only owners can change these." : "Read-only for your role."} />
        <div className="p-5">
          <ApiForm
            action="/api/v1/org"
            method="PATCH"
            successMessage="Workspace updated"
            fields={{ name: "string", timezone: "string", currency: "string" }}
          >
            <fieldset disabled={!canManage} className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={org.name} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Time zone" htmlFor="timezone" hint="(IANA)">
                  <Input id="timezone" name="timezone" defaultValue={org.timezone} required />
                </Field>
                <Field label="Currency" htmlFor="currency">
                  <Input id="currency" name="currency" defaultValue={org.currency} maxLength={3} required />
                </Field>
              </div>
            </fieldset>
          </ApiForm>
        </div>
      </Card>
      <Card>
        <CardHeader title="Your account" />
        <dl className="space-y-2 p-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium">{session.user.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium">{session.user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Role here</dt>
            <dd className="font-medium capitalize">{session.role}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Another workspace" description="Run several centres or branches from one account." />
        <div className="p-5">
          <CreateOrgForm />
        </div>
      </Card>
    </div>
  );
}
