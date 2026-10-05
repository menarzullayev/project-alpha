import { redirect } from "next/navigation";
import { MfaCard, MfaVerify } from "@/components/root/mfa-forms";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";

export const metadata = { title: "Verify" };

export default async function MfaVerifyPage() {
  const { session } = await requireRoot("platform:read", { allowMfaPending: true });
  if (!session.user.totpEnabled) redirect("/root/mfa/setup");
  const { t } = await getRootT();
  return (
    <MfaCard title={t.mfa.verifyTitle} intro={t.mfa.verifyIntro}>
      <MfaVerify t={t.mfa} />
    </MfaCard>
  );
}
