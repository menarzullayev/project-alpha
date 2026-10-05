import { AcceptInviteForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getInvitationByToken } from "@/server/domains/auth";
import { getPageSession } from "@/server/http/page-auth";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [inv, session] = await Promise.all([getInvitationByToken(getDb(), token), getPageSession()]);
  if (!inv) return <Alert tone="amber">This invitation link is invalid, expired or has already been used.</Alert>;
  return <AcceptInviteForm token={token} email={inv.invitation.email} orgName={inv.orgName} signedInAs={session?.user.email ?? null} />;
}
