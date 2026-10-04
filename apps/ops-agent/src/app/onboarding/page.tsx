import { redirect } from "next/navigation";
import { CreateOrgForm } from "@/components/auth/auth-forms";
import { getPageSession } from "@/server/http/page-auth";

export default async function OnboardingPage() {
  const session = await getPageSession();
  if (!session) redirect("/login");
  if (session.org) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Create a workspace</h1>
        <p className="mb-4 text-sm text-slate-500">You are not a member of any workspace yet.</p>
        <CreateOrgForm />
      </div>
    </main>
  );
}
