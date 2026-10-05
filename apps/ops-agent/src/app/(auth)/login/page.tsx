import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { getPageSession, homeFor, safeNext } from "@/server/http/page-auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  const session = await getPageSession();
  if (session) redirect(session.user.mustChangePassword ? "/account/password" : (next ?? homeFor(session)));
  return <LoginForm next={next ?? "/"} />;
}
