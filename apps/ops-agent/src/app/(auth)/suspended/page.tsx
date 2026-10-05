import { redirect } from "next/navigation";
import { SuspendedActions } from "@/components/auth/auth-forms";
import { getPageSession } from "@/server/http/page-auth";

export const metadata = { title: "Workspace suspended" };

export default async function SuspendedPage() {
  const session = await getPageSession();
  if (!session) redirect("/login");
  if (session.org?.status !== "suspended") redirect("/");
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Workspace suspended</h1>
      <p className="text-sm text-slate-600">
        <strong>{session.org.name}</strong> has been suspended by the platform team, so the dashboard and the Telegram agent are paused.
      </p>
      <p className="text-sm text-slate-500">Please contact OpsAgent support to restore access.</p>
      <SuspendedActions others={session.memberships.filter((m) => m.orgId !== session.org!.id).map((m) => ({ orgId: m.orgId, orgName: m.orgName }))} />
    </div>
  );
}
