import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "@/server/lib/totp";
import { canPlatform, PLATFORM_PERMISSIONS, type PlatformPermission, type PlatformRole, PLATFORM_ROLES } from "@/server/platform/rbac";
import { toCsv } from "@/server/platform/reports";
import { safeNext } from "@/server/http/safe-next";

// RFC 6238 appendix B uses the ASCII secret "12345678901234567890" (SHA-1).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("base32 round-trips and matches the RFC secret encoding", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
    expect(base32Decode("gezd gnbv-gy3t qojq").toString()).toBe("1234567890");
  });

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("t=%is → %s", (t, code) => {
    expect(totpCode(RFC_SECRET, t * 1000)).toBe(code);
  });

  it("accepts ±1 step of clock drift but nothing further", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });

  it("generates 160-bit secrets and a valid otpauth URI", () => {
    const s = generateTotpSecret();
    expect(base32Decode(s)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(s);
    const uri = otpauthUri(s, "root@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain("issuer=OpsAgent%20Root");
  });
});

// Independent expectation table (minimum platform role per permission).
const EXPECTED_MIN: Record<PlatformPermission, PlatformRole> = {
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
};

describe("platform RBAC", () => {
  it("covers every permission with the expected minimum role", () => {
    expect(Object.keys(PLATFORM_PERMISSIONS).sort()).toEqual(Object.keys(EXPECTED_MIN).sort());
    for (const [perm, min] of Object.entries(EXPECTED_MIN) as [PlatformPermission, PlatformRole][]) {
      for (const role of PLATFORM_ROLES) {
        expect(canPlatform(role, perm), `${role} → ${perm}`).toBe(PLATFORM_ROLES.indexOf(role) >= PLATFORM_ROLES.indexOf(min));
      }
    }
  });

  it("denies everything to customers (no platform role)", () => {
    for (const perm of Object.keys(PLATFORM_PERMISSIONS) as PlatformPermission[]) {
      expect(canPlatform(null, perm)).toBe(false);
      expect(canPlatform(undefined, perm)).toBe(false);
    }
  });
});

describe("CSV export", () => {
  it("quotes and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ a: "=HYPERLINK(\"x\")", b: "plain", c: "x,y", d: null, e: new Date("2026-01-02T03:04:05Z") }]);
    const [head, row] = csv.trim().split("\n");
    expect(head).toBe("a,b,c,d,e");
    expect(row).toBe(`"'=HYPERLINK(""x"")",plain,"x,y",,2026-01-02T03:04:05.000Z`);
    expect(toCsv([{ v: "-1+1" }, { v: "@cmd" }])).toBe("v\n'-1+1\n'@cmd\n");
  });
});

describe("login redirect target", () => {
  it("only allows same-origin paths", () => {
    expect(safeNext("/root")).toBe("/root");
    expect(safeNext("/root/users?q=a")).toBe("/root/users?q=a");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, 42, "/x\"onload"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});

describe("temporary passwords", () => {
  it("are 16 unambiguous random characters in four groups", async () => {
    const { temporaryPassword } = await import("@/server/platform/users");
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = temporaryPassword();
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});
