/**
 * Role-based access control. Roles are ordered; each permission names the
 * minimum role that holds it. Keep this table the single source of truth.
 */
export const ROLES = ["viewer", "operator", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "dashboard:read": "viewer",
  "crm:read": "viewer",
  "crm:write": "operator",
  "conversations:reply": "operator",
  "bookings:write": "operator",
  "catalog:write": "admin",
  "knowledge:write": "admin",
  "agent:configure": "admin",
  "integrations:manage": "admin",
  "team:read": "viewer",
  "team:manage": "admin",
  "audit:read": "admin",
  "org:manage": "owner",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export function roleRank(role: Role): number {
  return ROLES.indexOf(role);
}

export function can(role: Role, permission: Permission): boolean {
  return roleRank(role) >= roleRank(PERMISSIONS[permission]);
}

/** A member may only grant or change roles strictly below their own (owners may grant any). */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  return roleRank(actor) > roleRank(target);
}
