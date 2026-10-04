import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { getPageSession } from "@/server/http/page-auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getPageSession()) redirect("/dashboard");
  return <LoginForm />;
}
