import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { errors } from "../lib/errors";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../lib/totp";
import { recordPlatformAudit, type RootActor } from "./audit";

/** Starts (or restarts) enrollment: stores a pending secret until confirmed. */
export async function startMfaSetup(db: Db, actor: RootActor) {
  const [u] = await db.select({ totpEnabledAt: users.totpEnabledAt }).from(users).where(eq(users.id, actor.userId));
  if (u?.totpEnabledAt) throw errors.conflict("Two-factor authentication is already enabled");
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecretEncrypted: encryptSecret(secret) }).where(eq(users.id, actor.userId));
  const uri = otpauthUri(secret, actor.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200 });
  return { secret, uri, qrSvg };
}

async function loadSecret(db: Db, userId: string) {
  const [u] = await db.select({ enc: users.totpSecretEncrypted, enabledAt: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  if (!u?.enc) throw errors.badRequest("Two-factor authentication has not been set up");
  return { secret: decryptSecret(u.enc), enabledAt: u.enabledAt };
}

export async function confirmMfaSetup(db: Db, actor: RootActor, sessionId: string, code: string) {
  const { secret, enabledAt } = await loadSecret(db, actor.userId);
  if (enabledAt) throw errors.conflict("Two-factor authentication is already enabled");
  if (!verifyTotp(secret, code)) throw errors.validation({ code: ["Invalid code"] }, "Invalid code");
  await db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, actor.userId));
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
  await recordPlatformAudit(db, actor, { action: "mfa.enabled", targetType: "user", targetId: actor.userId });
}

export async function verifyMfa(db: Db, actor: RootActor, sessionId: string, code: string) {
  const { secret, enabledAt } = await loadSecret(db, actor.userId);
  if (!enabledAt) throw errors.badRequest("Two-factor authentication has not been enabled");
  if (!verifyTotp(secret, code)) {
    await recordPlatformAudit(db, actor, { action: "mfa.challenge_failed", targetType: "user", targetId: actor.userId });
    throw errors.validation({ code: ["Invalid code"] }, "Invalid code");
  }
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
  await recordPlatformAudit(db, actor, { action: "mfa.challenge_passed", targetType: "user", targetId: actor.userId });
}
