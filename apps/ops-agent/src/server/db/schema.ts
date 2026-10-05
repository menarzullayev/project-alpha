/**
 * Database schema. Every tenant-owned table carries `org_id` and every
 * tenant query in the repositories filters by it (see src/server/tenancy.ts).
 *
 * Tables live in a dedicated Postgres schema (`ops_agent`) so they are never
 * exposed through Supabase's auto-generated REST API on the `public` schema.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const app = pgSchema("ops_agent");

export const roleEnum = app.enum("member_role", ["owner", "admin", "operator", "viewer"]);
export const leadStatusEnum = app.enum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "trial_booked",
  "won",
  "lost",
]);
export const bookingStatusEnum = app.enum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "attended",
  "no_show",
]);
export const conversationStatusEnum = app.enum("conversation_status", ["bot", "handoff", "closed"]);
export const messageDirectionEnum = app.enum("message_direction", ["inbound", "outbound"]);
export const senderTypeEnum = app.enum("sender_type", ["customer", "agent", "operator", "system"]);
export const deliveryStatusEnum = app.enum("delivery_status", ["received", "pending", "sent", "failed"]);
export const knowledgeStatusEnum = app.enum("knowledge_status", ["draft", "approved", "archived"]);
export const webhookStatusEnum = app.enum("webhook_status", ["processing", "processed", "failed", "ignored"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

// ---------------------------------------------------------------- identity

export const users = app.table(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const organizations = app.table(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("Asia/Tashkent"),
    currency: text("currency").notNull().default("UZS"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)],
);

export const memberships = app.table(
  "memberships",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const sessions = app.table(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    activeOrgId: uuid("active_org_id").references(() => organizations.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const invitations = app.table(
  "invitations",
  {
    id: id(),
    orgId: orgId(),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invitations_token_uq").on(t.tokenHash), index("invitations_org_idx").on(t.orgId)],
);

// ---------------------------------------------------------------- CRM

export const customers = app.table(
  "customers",
  {
    id: id(),
    orgId: orgId(),
    fullName: text("full_name"),
    phone: text("phone"),
    telegramUserId: text("telegram_user_id"),
    telegramUsername: text("telegram_username"),
    language: text("language"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_org_tg_uq").on(t.orgId, t.telegramUserId),
    index("customers_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const courses = app.table(
  "courses",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default(""),
    level: text("level").notNull().default(""),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    priceAmount: integer("price_amount").notNull(),
    pricePeriod: text("price_period").notNull().default("month"),
    durationWeeks: integer("duration_weeks"),
    scheduleText: text("schedule_text").notNull().default(""),
    format: text("format").notNull().default("offline"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("courses_org_idx").on(t.orgId)],
);

export const courseSlots = app.table(
  "course_slots",
  {
    id: id(),
    orgId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(60),
    capacity: integer("capacity").notNull().default(5),
    location: text("location").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("course_slots_course_idx").on(t.orgId, t.courseId, t.startsAt)],
);

export const leads = app.table(
  "leads",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    status: leadStatusEnum("status").notNull().default("new"),
    source: text("source").notNull().default("telegram"),
    interestedCourseId: uuid("interested_course_id").references(() => courses.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // At most one open lead per customer: duplicate webhooks cannot create twins.
    uniqueIndex("leads_open_customer_uq")
      .on(t.orgId, t.customerId)
      .where(sql`status not in ('won', 'lost')`),
    index("leads_org_status_idx").on(t.orgId, t.status, t.createdAt),
  ],
);

export const bookings = app.table(
  "bookings",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => courseSlots.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    source: text("source").notNull().default("telegram"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("bookings_active_slot_customer_uq")
      .on(t.slotId, t.customerId)
      .where(sql`status in ('pending', 'confirmed')`),
    index("bookings_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

// ---------------------------------------------------------------- integrations & messaging

export const integrations = app.table(
  "integrations",
  {
    id: id(),
    orgId: orgId(),
    type: text("type").notNull(),
    status: text("status").notNull().default("active"),
    name: text("name").notNull().default(""),
    /** "live" talks to Telegram; "sandbox" records outbound messages without sending. */
    mode: text("mode").notNull().default("live"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secretEncrypted: text("secret_encrypted"),
    webhookSecret: text("webhook_secret").notNull(),
    managerChatId: text("manager_chat_id"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_org_type_uq").on(t.orgId, t.type)],
);

export type ConversationState = {
  stage?: "idle" | "awaiting_course" | "awaiting_slot" | "awaiting_name" | "awaiting_phone" | "booked";
  courseId?: string;
  offeredSlotIds?: string[];
  slotId?: string;
  language?: "uz" | "ru" | "en";
  unknownCount?: number;
};

export const conversations = app.table(
  "conversations",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    externalChatId: text("external_chat_id").notNull(),
    status: conversationStatusEnum("status").notNull().default("bot"),
    state: jsonb("state").$type<ConversationState>().notNull().default({}),
    handoffReason: text("handoff_reason"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_chat_uq").on(t.orgId, t.channel, t.externalChatId),
    index("conversations_org_last_idx").on(t.orgId, t.lastMessageAt),
  ],
);

export type MessageMeta = {
  intent?: string;
  confidence?: number;
  sources?: string[];
  provider?: string;
  action?: string;
};

export const messages = app.table(
  "messages",
  {
    id: id(),
    orgId: orgId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    senderType: senderTypeEnum("sender_type").notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    externalMessageId: text("external_message_id"),
    replyToId: uuid("reply_to_id"),
    deliveryStatus: deliveryStatusEnum("delivery_status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    meta: jsonb("meta").$type<MessageMeta>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("messages_inbound_external_uq")
      .on(t.conversationId, t.externalMessageId)
      .where(sql`direction = 'inbound' and external_message_id is not null`),
    // One automated reply per inbound message: retries cannot double-reply.
    uniqueIndex("messages_agent_reply_uq")
      .on(t.replyToId)
      .where(sql`sender_type = 'agent' and reply_to_id is not null`),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const webhookEvents = app.table(
  "webhook_events",
  {
    id: id(),
    orgId: orgId(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    status: webhookStatusEnum("status").notNull().default("processing"),
    attempts: integer("attempts").notNull().default(1),
    payload: jsonb("payload").notNull(),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("webhook_events_uq").on(t.integrationId, t.externalId)],
);

// ---------------------------------------------------------------- knowledge & agent

export const knowledgeArticles = app.table(
  "knowledge_articles",
  {
    id: id(),
    orgId: orgId(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("faq"),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    status: knowledgeStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_org_status_idx").on(t.orgId, t.status)],
);

export const agentSettings = app.table("agent_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull().default("Assistant"),
  defaultLanguage: text("default_language").notNull().default("uz"),
  greeting: text("greeting").notNull().default(""),
  tone: text("tone").notNull().default("friendly"),
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(true),
  llmEnabled: boolean("llm_enabled").notNull().default(true),
  escalationKeywords: text("escalation_keywords").array().notNull().default(sql`'{}'::text[]`),
  maxUnknownBeforeHandoff: integer("max_unknown_before_handoff").notNull().default(2),
  businessInfo: text("business_info").notNull().default(""),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- operations

export const notifications = app.table(
  "notifications",
  {
    id: id(),
    orgId: orgId(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_org_idx").on(t.orgId, t.createdAt)],
);

export const auditLogs = app.table(
  "audit_logs",
  {
    id: id(),
    orgId: orgId(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created_idx").on(t.orgId, t.createdAt)],
);

export const rateLimits = app.table("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
