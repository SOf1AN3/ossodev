CREATE TABLE "badges" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt_snapshot" text NOT NULL,
	"launched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"folder_path" text NOT NULL,
	"last_scan_at" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_folder_path_unique" UNIQUE("folder_path")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"frequency" text NOT NULL,
	"weekdays" integer[],
	"points" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routines_frequency_check" CHECK ("routines"."frequency" in ('daily', 'weekly'))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"source" text DEFAULT 'oneoff' NOT NULL,
	"scheduled_date" date NOT NULL,
	"routine_id" uuid,
	"points" integer DEFAULT 10 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'doing', 'done')),
	CONSTRAINT "tasks_source_check" CHECK ("tasks"."source" in ('oneoff', 'routine'))
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"badge_code" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_user_badges_badge_code" UNIQUE("badge_code")
);
--> statement-breakpoint
CREATE TABLE "weekly_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"title" text NOT NULL,
	"target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_weekly_missions_week_start" UNIQUE("week_start")
);
--> statement-breakpoint
ALTER TABLE "lead_sessions" ADD CONSTRAINT "lead_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_code_badges_code_fk" FOREIGN KEY ("badge_code") REFERENCES "public"."badges"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project" ON "project_tasks" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_routine_instance" ON "tasks" USING btree ("routine_id","scheduled_date") WHERE "tasks"."routine_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_tasks_scheduled" ON "tasks" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
--> statement-breakpoint
-- Seed : catalogue des 12 badges (idempotent)
INSERT INTO "badges" ("code", "name", "description", "icon") VALUES
  ('first_step',  'Première pierre',   'Valide ta toute première tâche',            '🪨'),
  ('streak_3',    'embardée',          '3 jours consécutifs sans rien rater',       '🔥'),
  ('streak_7',    'Semaine de feu',    '7 jours consécutifs',                       '🔥'),
  ('streak_30',   'Régulier',          '30 jours consécutifs',                      '⚡'),
  ('streak_100',  'Mythe',             '100 jours consécutifs',                     '👑'),
  ('tasks_25',    'En route',          '25 tâches validées',                        '🚀'),
  ('tasks_100',   'Centurion',         '100 tâches validées',                       '💯'),
  ('tasks_500',   'Machine',           '500 tâches validées',                       '🏭'),
  ('perfect_day', 'Journée parfaite',  'Toutes les tâches du jour validées',        '🌟'),
  ('perfect_week','Semaine parfaite',  'Une semaine entière sans faute',            '🏆'),
  ('mission_1',   'Chasseur de missions','Première mission hebdomadaire réussie',   '🎯'),
  ('comeback',    'Retour de force',   'Reviens après 3 jours d''absence',          '📣')
ON CONFLICT ("code") DO NOTHING;