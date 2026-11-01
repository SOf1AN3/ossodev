CREATE TABLE "project_technologies" (
	"project_id" uuid NOT NULL,
	"technology" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_project_technology" UNIQUE("project_id","technology")
);
--> statement-breakpoint
DROP INDEX "idx_project_tasks_project";--> statement-breakpoint
ALTER TABLE "learning_courses" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "project_technologies" ADD CONSTRAINT "project_technologies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_technologies" ADD CONSTRAINT "project_technologies_technology_learning_courses_technology_fk" FOREIGN KEY ("technology") REFERENCES "public"."learning_courses"("technology") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_parent_id_project_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_tasks_tree" ON "project_tasks" USING btree ("project_id","parent_id","position");