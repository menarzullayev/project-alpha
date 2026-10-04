import { afterAll } from "vitest";

afterAll(async () => {
  const pool = globalThis.__opsAgentDb;
  if (pool) {
    globalThis.__opsAgentDb = undefined;
    await pool.sql.end({ timeout: 5 });
  }
});
