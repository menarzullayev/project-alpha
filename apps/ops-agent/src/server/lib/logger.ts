/**
 * Structured JSON logger. One line per event, secrets redacted by key name.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = /token|secret|password|authorization|cookie|api[_-]?key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return order[lvl] ?? order.info;
}

export type Logger = {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
};

export function createLogger(base: Record<string, unknown> = {}): Logger {
  const write = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    if (order[level] < threshold()) return;
    if (process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "1") return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(redact({ ...base, ...fields }) as Record<string, unknown>),
    });
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (f) => createLogger({ ...base, ...f }),
  };
}

export const logger = createLogger({ service: "ops-agent" });
