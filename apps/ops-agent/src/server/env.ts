import { z } from "zod";

/**
 * Environment validation. Fails fast with a readable message when the app
 * boots with a missing or malformed variable. Values are read lazily so that
 * `next build` can run without production secrets.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** 32-byte key, base64. Encrypts integration secrets (bot tokens) at rest. */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  CRON_SECRET: z.string().min(16).optional(),
  LLM_PROVIDER: z.enum(["rules", "anthropic", "openai"]).default("rules"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Allow sign-up of new organizations. */
  SIGNUP_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change process.env between cases. */
export function resetEnvCache() {
  cached = undefined;
}
