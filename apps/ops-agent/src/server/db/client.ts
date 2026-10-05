import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

declare global {
  var __opsAgentDb: { db: Db; sql: postgres.Sql } | undefined;
}

export function createDb(url: string, max = 5) {
  const sql = postgres(url, {
    max,
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return { db: drizzle(sql, { schema }), sql };
}

/** Process-wide connection pool (reused across hot reloads and warm lambdas). */
export function getDb(): Db {
  if (!globalThis.__opsAgentDb) {
    const e = env();
    globalThis.__opsAgentDb = createDb(e.DATABASE_URL, e.DB_POOL_MAX);
  }
  return globalThis.__opsAgentDb.db;
}

export function getSql(): postgres.Sql {
  getDb();
  return globalThis.__opsAgentDb!.sql;
}
