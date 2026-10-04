import { agentSettingsSchema, getAgentSettings, updateAgentSettings } from "@/server/domains/agent-settings";
import { route } from "@/server/http/api";

export const GET = route({ permission: "crm:read" }, async ({ db, tenant }) => ({ settings: await getAgentSettings(db, tenant.orgId) }));

export const PATCH = route({ permission: "agent:configure" }, async ({ db, tenant, body }) => ({
  settings: await updateAgentSettings(db, tenant, await body(agentSettingsSchema)),
}));
