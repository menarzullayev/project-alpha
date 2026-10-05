import { describe, expect, it } from "vitest";
import { can, canAssignRole, PERMISSIONS, type Permission, type Role, ROLES } from "@/server/rbac";

// Independent expectation table (minimum role per permission).
const EXPECTED_MIN: Record<Permission, Role> = {
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
};
const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 };

describe("rbac.can", () => {
  it("covers every permission", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(EXPECTED_MIN).sort());
    expect([...ROLES]).toEqual(["viewer", "operator", "admin", "owner"]);
  });

  for (const role of ["viewer", "operator", "admin", "owner"] as Role[]) {
    for (const perm of Object.keys(EXPECTED_MIN) as Permission[]) {
      const expected = RANK[role] >= RANK[EXPECTED_MIN[perm]];
      it(`${role} ${expected ? "can" : "cannot"} ${perm}`, () => {
        expect(can(role, perm)).toBe(expected);
      });
    }
  }
});

describe("rbac.canAssignRole", () => {
  const cases: [Role, Role, boolean][] = [
    ["owner", "owner", true],
    ["owner", "admin", true],
    ["owner", "viewer", true],
    ["admin", "owner", false],
    ["admin", "admin", false],
    ["admin", "operator", true],
    ["admin", "viewer", true],
    ["operator", "operator", false],
    ["operator", "viewer", true],
    ["viewer", "viewer", false],
    ["viewer", "owner", false],
  ];
  it.each(cases)("%s → %s = %s", (actor, target, expected) => {
    expect(canAssignRole(actor, target)).toBe(expected);
  });
});
