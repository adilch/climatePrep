CREATE TYPE "public"."analysis_status" AS ENUM('queued', 'running', 'done', 'stale', 'error');--> statement-breakpoint
CREATE TYPE "public"."analysis_type" AS ENUM('qc', 'pfa', 'pmp', 'design_storm', 'wind', 'freeboard', 'snowmelt', 'regional');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"station_id" uuid,
	"type" "analysis_type" NOT NULL,
	"name" text NOT NULL,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"inputs" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"engine_version" text,
	"app_version" text NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"results" jsonb NOT NULL,
	"figures" jsonb,
	"seed" integer,
	"computed_at" timestamp with time zone NOT NULL,
	"engine_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_project_idx" ON "analyses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "analyses_input_hash_idx" ON "analyses" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "analysis_results_analysis_idx" ON "analysis_results" USING btree ("analysis_id");