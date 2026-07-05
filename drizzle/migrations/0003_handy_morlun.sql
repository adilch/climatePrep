CREATE TYPE "public"."report_format" AS ENUM('docx', 'pdf', 'xlsx', 'model_forcing');--> statement-breakpoint
CREATE TABLE "report_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"analysis_id" uuid,
	"format" "report_format" NOT NULL,
	"blob_ref" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer,
	"sections" jsonb,
	"generated_at" timestamp with time zone NOT NULL,
	"app_version" text NOT NULL,
	"engine_version" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_documents" ADD CONSTRAINT "report_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_documents" ADD CONSTRAINT "report_documents_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_documents" ADD CONSTRAINT "report_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_documents_project_idx" ON "report_documents" USING btree ("project_id");