import { createSandboxIntegration, publicIntegration } from "@/server/domains/integrations";
import { route } from "@/server/http/api";

export const POST = route({ permission: "integrations:manage" }, async ({ db, tenant }) => {
  const i = await createSandboxIntegration(db, tenant);
  return { integration: i ? publicIntegration(i) : null };
});
