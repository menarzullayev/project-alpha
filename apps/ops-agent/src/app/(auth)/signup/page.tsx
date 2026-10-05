import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/primitives";
import { env } from "@/server/env";
import { getPageSession } from "@/server/http/page-auth";

export const metadata = { title: "Create workspace" };

export default async function SignupPage() {
  if (await getPageSession()) redirect("/dashboard");
  if (!env().SIGNUP_ENABLED) return <Alert tone="amber">Sign-up is currently closed. Ask your administrator for an invitation.</Alert>;
  return <SignupForm />;
}
