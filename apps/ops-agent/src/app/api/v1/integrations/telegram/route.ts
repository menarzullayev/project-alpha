import {
  connectTelegram,
  connectTelegramSchema,
  disconnectTelegram,
  getTelegramIntegration,
  integrationUpdateSchema,
  publicIntegration,
  updateIntegration,
} from "@/server/domains/integrations";
import { route } from "@/server/http/api";

export const GET = route({ permission: "crm:read" }, async ({ db, tenant }) => {
  const i = await getTelegramIntegration(db, tenant);
  return { integration: i ? publicIntegration(i) : null };
});

export const POST = route({ permission: "integrations:manage", rateLimit: { key: "tg-connect", limit: 10, windowSec: 600 } }, async ({ db, tenant, body }) => {
  const { botToken } = await body(connectTelegramSchema);
  return { integration: publicIntegration(await connectTelegram(db, tenant, botToken)) };
});

export const PATCH = route({ permission: "integrations:manage" }, async ({ db, tenant, body }) => ({
  integration: publicIntegration(await updateIntegration(db, tenant, await body(integrationUpdateSchema))),
}));

export const DELETE = route({ permission: "integrations:manage" }, async ({ db, tenant }) => {
  await disconnectTelegram(db, tenant);
  return { ok: true };
});
