import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Recreates the `ops_agent` schema in the test database and applies migrations. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/opsagent_test";
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema if exists ops_agent cascade");
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle", migrationsSchema: "ops_agent", migrationsTable: "__migrations" });
  } finally {
    await sql.end();
  }
}
