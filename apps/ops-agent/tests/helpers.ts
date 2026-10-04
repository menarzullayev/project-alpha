import type { TelegramUpdate } from "@/server/domains/telegram-webhook";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { acceptInvitation, createInvitation, signup } from "@/server/domains/auth";
import { createCourse, createSlot } from "@/server/domains/courses";
import type { Role } from "@/server/rbac";
import type { TenantContext } from "@/server/tenancy";

export const APP_ORIGIN = "http://localhost:3000";
export const TEST_PASSWORD = "correct-horse-42";

export function uid(prefix = "t") {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function uniqueEmail(prefix = "user") {
  return `${prefix}.${randomUUID()}@example.test`;
}

let ipSeq = 0;
/** A fresh client IP so per-IP rate limits never bleed across tests. */
export function uniqueIp() {
  ipSeq++;
  const r = randomUUID().replace(/-/g, "");
  return `10.${parseInt(r.slice(0, 2), 16)}.${parseInt(r.slice(2, 4), 16)}.${ipSeq % 250}`;
}

export type TestOrg = {
  db: Db;
  ctx: TenantContext;
  token: string;
  user: typeof schema.users.$inferSelect;
  org: typeof schema.organizations.$inferSelect;
  email: string;
};

/** Signs up a brand-new user + organization (owner). */
export async function makeOrg(name = "Test Centre"): Promise<TestOrg> {
  const db = getDb();
  const email = uniqueEmail("owner");
  const r = await signup(db, { name: "Owner User", email, password: TEST_PASSWORD, organizationName: `${name} ${uid("o")}` }, { ip: "127.0.0.1" });
  return {
    db,
    ctx: { orgId: r.org.id, userId: r.user.id, role: "owner", actorType: "user" },
    token: r.token,
    user: r.user,
    org: r.org,
    email,
  };
}

/** Adds a member with the given role to `owner`'s org via a real invitation. */
export async function makeMember(owner: TestOrg, role: Exclude<Role, "owner">) {
  const db = owner.db;
  const email = uniqueEmail(role);
  const { token: inviteToken } = await createInvitation(db, owner.ctx, { email, role });
  const r = await acceptInvitation(db, { token: inviteToken, name: `${role} user`, password: TEST_PASSWORD }, null, { ip: "127.0.0.1" });
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
  const ctx: TenantContext = { orgId: owner.org.id, userId: user.id, role, actorType: "user" };
  return { token: r.session!.token, user, email, ctx };
}

type ReqOpts = {
  token?: string | null;
  body?: unknown;
  /** Origin header; null omits it. Defaults to the app origin. */
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
  rawBody?: string;
};

export function apiRequest(method: string, path: string, opts: ReqOpts = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? uniqueIp(),
    ...(opts.headers ?? {}),
  };
  const origin = opts.origin === undefined ? APP_ORIGIN : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.token) headers.cookie = `ops_session=${encodeURIComponent(opts.token)}`;
  const hasBody = opts.rawBody !== undefined || (opts.body !== undefined && !["GET", "HEAD"].includes(method));
  return new Request(`${APP_ORIGIN}${path}`, {
    method,
    headers,
    body: hasBody ? (opts.rawBody ?? JSON.stringify(opts.body)) : undefined,
  });
}

type RouteHandler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;

/** Invokes a Next.js route handler directly. */
export async function call(handler: RouteHandler, req: Request, params: Record<string, string> = {}) {
  const res = await handler(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

let updateSeq = 1_000_000 + Math.floor(Math.random() * 1_000_000);
export function nextUpdateId() {
  return updateSeq++;
}

export type TgUpdateOpts = {
  updateId?: number;
  messageId?: number;
  chatId?: number;
  fromId?: number;
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  chatType?: string;
  isBot?: boolean;
  firstName?: string;
  lastName?: string;
  username?: string;
};

/** Builds a Telegram `Update` payload for a private text message. */
export function tgUpdate(o: TgUpdateOpts = {}) {
  const updateId = o.updateId ?? nextUpdateId();
  const fromId = o.fromId ?? 500_000 + (updateId % 100_000);
  const chatId = o.chatId ?? fromId;
  const message: Record<string, unknown> = {
    message_id: o.messageId ?? updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: o.chatType ?? "private" },
    from: {
      id: fromId,
      is_bot: o.isBot ?? false,
      first_name: o.firstName ?? "Test",
      ...(o.lastName ? { last_name: o.lastName } : {}),
      username: o.username ?? `user${fromId}`,
      language_code: "uz",
    },
  };
  if (o.text !== undefined) message.text = o.text;
  if (o.contact) message.contact = o.contact;
  return { update_id: updateId, message: message as NonNullable<TelegramUpdate["message"]> } satisfies TelegramUpdate;
}

let tgUserSeq = 700_000_000 + Math.floor(Math.random() * 100_000_000);
export function nextTgUserId() {
  return tgUserSeq++;
}

export function futureDate(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 3600_000);
}

export async function addCourse(db: Db, ctx: TenantContext, overrides: Partial<Parameters<typeof createCourse>[2]> = {}) {
  return createCourse(db, ctx, {
    name: "Ingliz tili (General English)",
    description: "Umumiy ingliz tili",
    category: "Tillar",
    level: "Beginner",
    keywords: ["ingliz", "english", "inglizcha"],
    priceAmount: 450000,
    pricePeriod: "month",
    durationWeeks: 24,
    scheduleText: "Dush/Chor/Juma 15:00",
    format: "offline",
    isActive: true,
    ...overrides,
  });
}

export async function addSlot(db: Db, ctx: TenantContext, courseId: string, overrides: Partial<Parameters<typeof createSlot>[3]> = {}) {
  return createSlot(db, ctx, courseId, {
    startsAt: futureDate(48),
    durationMin: 60,
    capacity: 5,
    location: "Room 1",
    ...overrides,
  });
}

// ---------------------------------------------------------------- DB inspection

export async function count(db: Db, table: any, where: any) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return Number(r.n);
}

export async function orgMessages(db: Db, orgId: string) {
  return db.select().from(schema.messages).where(eq(schema.messages.orgId, orgId)).orderBy(schema.messages.createdAt);
}

export async function orgLeads(db: Db, orgId: string) {
  return db.select().from(schema.leads).where(eq(schema.leads.orgId, orgId));
}

export async function orgBookings(db: Db, orgId: string) {
  return db.select().from(schema.bookings).where(eq(schema.bookings.orgId, orgId));
}

export async function orgNotifications(db: Db, orgId: string, type?: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(type ? and(eq(schema.notifications.orgId, orgId), eq(schema.notifications.type, type)) : eq(schema.notifications.orgId, orgId));
}

export { schema };
