import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/auth-forms";
import { getPageSession } from "@/server/http/page-auth";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const session = await getPageSession();
  if (!session) redirect("/login?next=/account/password");
  return <ChangePasswordForm forced={session.user.mustChangePassword} />;
}
