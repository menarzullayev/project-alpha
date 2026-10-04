import path from "node:path";
import { defineConfig } from "vitest/config";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/opsagent_test";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/per-file.ts"],
    // Tests isolate themselves with unique organizations, but run files one at a
    // time so DB-wide jobs (daily reports) and timing assertions stay stable.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      APP_URL: "http://localhost:3000",
      // 32 zero-ish bytes, base64 — a fixed test key.
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      CRON_SECRET: "test-cron-secret-123456",
      LLM_PROVIDER: "rules",
      DB_POOL_MAX: "10",
    },
  },
});
