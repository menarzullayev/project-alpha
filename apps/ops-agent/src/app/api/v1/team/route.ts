import { listMembers, listPendingInvitations } from "@/server/domains/team";
import { route } from "@/server/http/api";
import { can } from "@/server/rbac";

export const GET = route({ permission: "team:read" }, async ({ db, tenant }) => ({
  members: await listMembers(db, tenant),
  invitations: can(tenant.role, "team:manage") ? await listPendingInvitations(db, tenant) : [],
}));
