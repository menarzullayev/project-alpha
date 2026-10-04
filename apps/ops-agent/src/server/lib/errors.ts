/** Typed application errors mapped to HTTP status codes by the API layer. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  validation: (details: unknown, message = "Invalid input") => new AppError("validation_error", message, 400, details),
  unauthorized: (message = "Authentication required") => new AppError("unauthorized", message, 401),
  forbidden: (message = "You do not have permission to do this") => new AppError("forbidden", message, 403),
  notFound: (entity = "Resource") => new AppError("not_found", `${entity} not found`, 404),
  conflict: (message: string) => new AppError("conflict", message, 409),
  rateLimited: (retryAfterSec: number) =>
    new AppError("rate_limited", "Too many requests", 429, { retryAfterSec }),
  badRequest: (message: string) => new AppError("bad_request", message, 400),
};

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = findPgError(err);
  if (!e || e.code !== "23505") return false;
  return constraint ? e.constraint_name === constraint || e.constraint === constraint : true;
}

type PgError = { code?: string; constraint_name?: string; constraint?: string };

function findPgError(err: unknown): PgError | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur && typeof (cur as PgError).code === "string") {
      return cur as PgError;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}
