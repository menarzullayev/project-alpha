import type { Role } from "./rbac";

/**
 * The authenticated request context. Every domain service receives one and
 * scopes its queries by `orgId`; services never accept an org id from input.
 */
export type TenantContext = {
  orgId: string;
  userId: string | null;
  role: Role;
  /** "user" for dashboard requests, "agent"/"system" for automated work. */
  actorType: "user" | "agent" | "system";
  ip?: string | null;
};

export function systemContext(orgId: string, actorType: "agent" | "system" = "system"): TenantContext {
  return { orgId, userId: null, role: "owner", actorType };
}
