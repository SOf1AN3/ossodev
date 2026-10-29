CREATE TABLE "companion_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"command_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_text" text,
	"claimed_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companion_commands_status_check" CHECK ("companion_commands"."status" in ('pending', 'claimed', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "companion_presence" (
	"id" text PRIMARY KEY DEFAULT 'local' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"app_version" text
);
--> statement-breakpoint
CREATE TABLE "learning_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technology" text NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "learning_courses_status_check" CHECK ("learning_courses"."status" in ('todo', 'done'))
);
--> statement-breakpoint
CREATE INDEX "idx_companion_pending" ON "companion_commands" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_companion_expiry" ON "companion_commands" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_learning_technology" ON "learning_courses" USING btree ("technology");--> statement-breakpoint
CREATE INDEX "idx_learning_status" ON "learning_courses" USING btree ("status");