/**
 * Bootstrap / break-glass: grant (or revoke) a platform role from the shell.
 *
 *   npm run root:grant -- <email> <superadmin|admin|support|none> [name]
 *
 * Creates the user with a temporary password (printed once, must be changed
 * at first login) if the email does not exist yet. Every change is written to
 * the platform audit log as actor "cli".
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { hashPassword } from "../src/server/lib/crypto";
import { recordPlatformAudit } from "../src/server/platform/audit";
import { temporaryPassword } from "../src/server/platform/users";

async function main() {
  const [email, roleArg, ...nameParts] = process.argv.slice(2);
  const roles = ["superadmin", "admin", "support", "none"];
  if (!email || !roles.includes(roleArg ?? "")) {
    console.error("Usage: npm run root:grant -- <email> <superadmin|admin|support|none> [name]");
    process.exit(2);
  }
  const role = roleArg === "none" ? null : (roleArg as "superadmin" | "admin" | "support");
  const { db, sql: conn } = createDb(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!, 1);
  try {
    const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    let password: string | null = null;
    let id: string;
    if (existing) {
      await db.update(users).set({ platformRole: role }).where(eq(users.id, existing.id));
      id = existing.id;
    } else {
      if (!role) throw new Error("User does not exist");
      password = temporaryPassword();
      const [u] = await db
        .insert(users)
        .values({ email: email.toLowerCase(), name: nameParts.join(" ") || "Platform operator", passwordHash: await hashPassword(password), platformRole: role, mustChangePassword: true })
        .returning();
      id = u.id;
    }
    await recordPlatformAudit(db, { userId: id, email: "cli" }, { action: "user.platform_role_changed", targetType: "user", targetId: id, metadata: { via: "cli", to: role } });
    console.log(JSON.stringify({ level: "info", msg: "platform role updated", email, role, created: !existing, temporaryPassword: password ?? undefined }));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
