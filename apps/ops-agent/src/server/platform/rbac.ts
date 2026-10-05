/**
 * Platform (root panel) RBAC. Separate from workspace roles: a platform role
 * governs the whole SaaS, a workspace role governs one education centre.
 *
 *   superadmin — everything, including system settings and platform roles
 *   admin      — manages users, organizations, announcements; reads audit
 *   support    — read-only access to dashboards, users, organizations
 */
export const PLATFORM_ROLES = ["support", "admin", "superadmin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_PERMISSIONS = {
  "platform:read": "support",
  "users:read": "support",
  "orgs:read": "support",
  "reports:read": "support",
  "users:write": "admin",
  "users:suspend": "admin",
  "orgs:write": "admin",
  "orgs:suspend": "admin",
  "announcements:write": "admin",
  "audit:read": "admin",
  "platform_roles:assign": "superadmin",
  "settings:write": "superadmin",
} as const satisfies Record<string, PlatformRole>;

export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;

export function platformRank(role: PlatformRole) {
  return PLATFORM_ROLES.indexOf(role);
}

export function canPlatform(role: PlatformRole | null | undefined, permission: PlatformPermission): boolean {
  if (!role) return false;
  return platformRank(role) >= platformRank(PLATFORM_PERMISSIONS[permission]);
}
