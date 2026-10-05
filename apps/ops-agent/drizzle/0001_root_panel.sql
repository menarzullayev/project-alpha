CREATE TYPE "ops_agent"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "ops_agent"."announcement_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "ops_agent"."platform_role" AS ENUM('superadmin', 'admin', 'support');--> statement-breakpoint
CREATE TABLE "ops_agent"."announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"severity" "ops_agent"."announcement_severity" DEFAULT 'info' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_agent"."platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_agent"."organizations" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_agent"."organizations" ADD COLUMN "status" "ops_agent"."account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_agent"."organizations" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_agent"."organizations" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "ops_agent"."sessions" ADD COLUMN "mfa_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "platform_role" "ops_agent"."platform_role";--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "status" "ops_agent"."account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "totp_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_agent"."users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_agent"."announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_agent"."platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "ops_agent"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_window_idx" ON "ops_agent"."announcements" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "ops_agent"."platform_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_action_idx" ON "ops_agent"."platform_audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "users_platform_role_idx" ON "ops_agent"."users" USING btree ("platform_role");