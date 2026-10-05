CREATE SCHEMA IF NOT EXISTS "ops_agent";
--> statement-breakpoint
CREATE TYPE "ops_agent"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'attended', 'no_show');--> statement-breakpoint
CREATE TYPE "ops_agent"."conversation_status" AS ENUM('bot', 'handoff', 'closed');--> statement-breakpoint
CREATE TYPE "ops_agent"."delivery_status" AS ENUM('received', 'pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "ops_agent"."knowledge_status" AS ENUM('draft', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "ops_agent"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'trial_booked', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "ops_agent"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "ops_agent"."member_role" AS ENUM('owner', 'admin', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "ops_agent"."sender_type" AS ENUM('customer', 'agent', 'operator', 'system');--> statement-breakpoint
CREATE TYPE "ops_agent"."webhook_status" AS ENUM('processing', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TABLE "ops_agent"."agent_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"agent_name" text DEFAULT 'Assistant' NOT NULL,
	"default_language" text DEFAULT 'uz' NOT NULL,
	"greeting" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"auto_reply_enabled" boolean DEFAULT true NOT NULL,
	"llm_enabled" boolean DEFAULT true NOT NULL,
	"escalation_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_unknown_before_handoff" integer DEFAULT 2 NOT NULL,
	"business_info" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"lead_id" uuid,
	"status" "ops_agent"."booking_status" DEFAULT 'confirmed' NOT NULL,
	"source" text DEFAULT 'telegram' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"integration_id" uuid,
	"external_chat_id" text NOT NULL,
	"status" "ops_agent"."conversation_status" DEFAULT 'bot' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"handoff_reason" text,
	"assigned_to" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."course_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"capacity" integer DEFAULT 5 NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"level" text DEFAULT '' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_amount" integer NOT NULL,
	"price_period" text DEFAULT 'month' NOT NULL,
	"duration_weeks" integer,
	"schedule_text" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'offline' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text,
	"phone" text,
	"telegram_user_id" text,
	"telegram_username" text,
	"language" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_encrypted" text,
	"webhook_secret" text NOT NULL,
	"manager_chat_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "ops_agent"."member_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'faq' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "ops_agent"."knowledge_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "ops_agent"."lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'telegram' NOT NULL,
	"interested_course_id" uuid,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "ops_agent"."member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "ops_agent"."message_direction" NOT NULL,
	"sender_type" "ops_agent"."sender_type" NOT NULL,
	"sender_user_id" uuid,
	"body" text NOT NULL,
	"external_message_id" text,
	"reply_to_id" uuid,
	"delivery_status" "ops_agent"."delivery_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Tashkent' NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"active_org_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"status" "ops_agent"."webhook_status" DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ops_agent"."agent_settings" ADD CONSTRAINT "agent_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."bookings" ADD CONSTRAINT "bookings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ops_agent"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."bookings" ADD CONSTRAINT "bookings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "ops_agent"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."bookings" ADD CONSTRAINT "bookings_slot_id_course_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "ops_agent"."course_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "ops_agent"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."conversations" ADD CONSTRAINT "conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ops_agent"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."conversations" ADD CONSTRAINT "conversations_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "ops_agent"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."conversations" ADD CONSTRAINT "conversations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."course_slots" ADD CONSTRAINT "course_slots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."course_slots" ADD CONSTRAINT "course_slots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "ops_agent"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."courses" ADD CONSTRAINT "courses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."integrations" ADD CONSTRAINT "integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."knowledge_articles" ADD CONSTRAINT "knowledge_articles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ops_agent"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."leads" ADD CONSTRAINT "leads_interested_course_id_courses_id_fk" FOREIGN KEY ("interested_course_id") REFERENCES "ops_agent"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ops_agent"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "ops_agent"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ops_agent"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."sessions" ADD CONSTRAINT "sessions_active_org_id_organizations_id_fk" FOREIGN KEY ("active_org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."webhook_events" ADD CONSTRAINT "webhook_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ops_agent"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."webhook_events" ADD CONSTRAINT "webhook_events_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "ops_agent"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_created_idx" ON "ops_agent"."audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_slot_customer_uq" ON "ops_agent"."bookings" USING btree ("slot_id","customer_id") WHERE status in ('pending', 'confirmed');--> statement-breakpoint
CREATE INDEX "bookings_org_created_idx" ON "ops_agent"."bookings" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_chat_uq" ON "ops_agent"."conversations" USING btree ("org_id","channel","external_chat_id");--> statement-breakpoint
CREATE INDEX "conversations_org_last_idx" ON "ops_agent"."conversations" USING btree ("org_id","last_message_at");--> statement-breakpoint
CREATE INDEX "course_slots_course_idx" ON "ops_agent"."course_slots" USING btree ("org_id","course_id","starts_at");--> statement-breakpoint
CREATE INDEX "courses_org_idx" ON "ops_agent"."courses" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_tg_uq" ON "ops_agent"."customers" USING btree ("org_id","telegram_user_id");--> statement-breakpoint
CREATE INDEX "customers_org_created_idx" ON "ops_agent"."customers" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_type_uq" ON "ops_agent"."integrations" USING btree ("org_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_uq" ON "ops_agent"."invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "ops_agent"."invitations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_org_status_idx" ON "ops_agent"."knowledge_articles" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_open_customer_uq" ON "ops_agent"."leads" USING btree ("org_id","customer_id") WHERE status not in ('won', 'lost');--> statement-breakpoint
CREATE INDEX "leads_org_status_idx" ON "ops_agent"."leads" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "ops_agent"."memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "ops_agent"."memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_inbound_external_uq" ON "ops_agent"."messages" USING btree ("conversation_id","external_message_id") WHERE direction = 'inbound' and external_message_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_agent_reply_uq" ON "ops_agent"."messages" USING btree ("reply_to_id") WHERE sender_type = 'agent' and reply_to_id is not null;--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "ops_agent"."messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_org_created_idx" ON "ops_agent"."messages" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "ops_agent"."notifications" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "ops_agent"."organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "ops_agent"."sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "ops_agent"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "ops_agent"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_uq" ON "ops_agent"."webhook_events" USING btree ("integration_id","external_id");--> statement-breakpoint
-- Defence in depth on Supabase: the API roles must never reach this schema.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA ops_agent FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA ops_agent FROM %I', r);
    END IF;
  END LOOP;
END $$;
