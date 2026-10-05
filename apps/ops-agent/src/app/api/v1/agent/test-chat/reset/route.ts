import { resetTestChat } from "@/server/domains/test-chat";
import { route } from "@/server/http/api";

export const POST = route({ permission: "crm:write" }, async ({ db, tenant, session }) => {
  await resetTestChat(db, tenant, session!.user.id);
  return { ok: true };
});
