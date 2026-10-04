import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { getDb, type Db } from "../db/client";
import { resolveSession, SESSION_COOKIE, type SessionInfo } from "../domains/auth";
import { env } from "../env";
import { AppError, errors } from "../lib/errors";
import { createLogger, type Logger } from "../lib/logger";
import { enforceRateLimit } from "../lib/rate-limit";
import { can, type Permission } from "../rbac";
import type { TenantContext } from "../tenancy";

export type ApiContext<P> = {
  req: Request;
  db: Db;
  params: P;
  log: Logger;
  requestId: string;
  ip: string | null;
  session: SessionInfo | null;
  /** Present whenever the route declares a permission. */
  tenant: TenantContext;
  body<T extends z.ZodTypeAny>(schema: T): Promise<z.infer<T>>;
  query<T extends z.ZodTypeAny>(schema: T): z.infer<T>;
};

type RouteOptions = {
  /** Permission in the active organization. Implies authentication. */
  permission?: Permission;
  /** "required" (default when a permission is set), "optional", or "none". */
  auth?: "required" | "optional" | "none";
  /** Per-IP limit: [max requests, window seconds]. */
  rateLimit?: { key: string; limit: number; windowSec: number };
};

type Handler<P> = (ctx: ApiContext<P>) => Promise<Response | unknown>;

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}

export function errorResponse(err: unknown, requestId: string, log: Logger) {
  if (err instanceof ZodError) {
    return json(
      { error: { code: "validation_error", message: "Invalid input", details: z.flattenError(err).fieldErrors, requestId } },
      { status: 400 },
    );
  }
  if (err instanceof AppError) {
    if (err.status >= 500) log.error("app error", { err });
    const headers: Record<string, string> = {};
    if (err.code === "rate_limited") headers["retry-after"] = String((err.details as { retryAfterSec: number }).retryAfterSec);
    return json({ error: { code: err.code, message: err.message, details: err.details, requestId } }, { status: err.status, headers });
  }
  log.error("unhandled error", { err });
  return json({ error: { code: "internal_error", message: "Something went wrong", requestId } }, { status: 500 });
}

/**
 * Cross-site request forgery guard for cookie-authenticated mutations: the
 * Origin header must match this deployment.
 */
function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) throw errors.forbidden("Missing Origin header");
  const allowed = new Set<string>([new URL(env().APP_URL).origin]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  if (!allowed.has(origin)) throw errors.forbidden("Cross-origin request rejected");
}

export function route<P = Record<string, string>>(opts: RouteOptions, handler: Handler<P>) {
  return async (req: Request, routeCtx?: { params?: Promise<P> }): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") || randomUUID();
    const url = new URL(req.url);
    const log = createLogger({ service: "ops-agent", requestId, method: req.method, path: url.pathname });
    const started = Date.now();
    let status = 500;
    try {
      const db = getDb();
      const ip = clientIp(req);
      if (opts.rateLimit) {
        await enforceRateLimit(db, `${opts.rateLimit.key}:${ip ?? "unknown"}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      const authMode = opts.auth ?? (opts.permission ? "required" : "none");
      let session: SessionInfo | null = null;
      if (authMode !== "none") {
        session = await resolveSession(db, readCookie(req, SESSION_COOKIE));
        if (!session && authMode === "required") throw errors.unauthorized();
        if (session) assertSameOrigin(req);
      }
      let tenant: TenantContext | undefined;
      if (opts.permission) {
        if (!session?.org || !session.role) throw errors.forbidden("No active organization");
        if (!can(session.role, opts.permission)) throw errors.forbidden();
        tenant = { orgId: session.org.id, userId: session.user.id, role: session.role, actorType: "user", ip };
      }
      const params = ((await routeCtx?.params) ?? {}) as P;
      const ctx: ApiContext<P> = {
        req,
        db,
        params,
        log,
        requestId,
        ip,
        session,
        tenant: tenant as TenantContext,
        async body(schema) {
          let raw: unknown;
          try {
            raw = await req.json();
          } catch {
            throw errors.badRequest("Request body must be valid JSON");
          }
          return schema.parse(raw);
        },
        query(schema) {
          return schema.parse(Object.fromEntries(url.searchParams));
        },
      };
      const result = await handler(ctx);
      const res = result instanceof Response ? result : json(result ?? { ok: true });
      status = res.status;
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      const res = errorResponse(err, requestId, log);
      status = res.status;
      res.headers.set("x-request-id", requestId);
      return res;
    } finally {
      log.info("request", { status, ms: Date.now() - started });
    }
  };
}

export const uuidParam = z.object({ id: z.string().uuid() });

export function parseId(params: { id?: string }) {
  const r = uuidParam.safeParse(params);
  if (!r.success) throw errors.notFound();
  return r.data.id;
}

export function sessionCookie(token: string, expiresAt: Date) {
  const secure = env().APP_URL.startsWith("https://") ? "; Secure" : "";
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
