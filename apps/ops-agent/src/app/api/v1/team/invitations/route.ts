import { createInvitation, inviteSchema } from "@/server/domains/auth";
import { env } from "@/server/env";
import { errors } from "@/server/lib/errors";
import { json, route } from "@/server/http/api";
import { canAssignRole } from "@/server/rbac";

export const POST = route({ permission: "team:manage", rateLimit: { key: "invite", limit: 30, windowSec: 3600 } }, async ({ db, tenant, body }) => {
  const input = await body(inviteSchema);
  if (!canAssignRole(tenant.role, input.role)) throw errors.forbidden("You cannot invite members with this role");
  const { invitation, token } = await createInvitation(db, tenant, input);
  // No email provider is configured: the link is shown once to the inviter to share.
  return json(
    { invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }, inviteUrl: `${env().APP_URL}/invite/${token}` },
    { status: 201 },
  );
});
