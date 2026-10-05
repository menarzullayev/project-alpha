import { redirect } from "next/navigation";
import { MfaCard, MfaSetup } from "@/components/root/mfa-forms";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";

export const metadata = { title: "Two-factor setup" };

export default async function MfaSetupPage() {
  const { session } = await requireRoot("platform:read", { allowMfaPending: true });
  if (session.user.totpEnabled) redirect("/root/mfa");
  const { t } = await getRootT();
  return (
    <MfaCard title={t.mfa.setupTitle} intro={t.mfa.setupIntro}>
      <MfaSetup t={t.mfa} />
    </MfaCard>
  );
}
