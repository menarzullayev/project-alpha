/**
 * Creates a demo owner account + organization with realistic data.
 * Usage: DEMO_EMAIL=... DEMO_PASSWORD=... npm run db:seed
 */
import "dotenv/config";
import { createDb } from "../src/server/db/client";
import { signup } from "../src/server/domains/auth";
import { seedDemoData } from "../src/server/domains/demo";

async function main() {
  const email = process.env.DEMO_EMAIL ?? "demo@opsagent.uz";
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD is required (min 10 chars, letters and digits)");
  const { db, sql } = createDb(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!, 1);
  try {
    const { user, org } = await signup(
      db,
      { name: "Demo Owner", email, password, organizationName: "Bilim Academy (demo)" },
      { ip: null, userAgent: "seed" },
    );
    const result = await seedDemoData(db, { orgId: org.id, userId: user.id, role: "owner", actorType: "user" });
    console.log(JSON.stringify({ level: "info", msg: "demo data seeded", email, orgId: org.id, result }));
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
