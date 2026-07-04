CREATE TYPE "public"."data_source" AS ENUM('msc_geomet', 'datamart', 'bulk_csv', 'ahccd', 'eng_climate');--> statement-breakpoint
CREATE TYPE "public"."pull_status" AS ENUM('pending', 'running', 'complete', 'error');--> statement-breakpoint
CREATE TYPE "public"."station_role" AS ENUM('primary', 'supporting', 'wind', 'comparison');--> statement-breakpoint
CREATE TABLE "data_pulls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"station_id" uuid NOT NULL,
	"source" "data_source" NOT NULL,
	"endpoint_url" text NOT NULL,
	"collection" text NOT NULL,
	"period_start" text,
	"period_end" text,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"row_count" integer,
	"status" "pull_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"cache_key" text,
	"blob_ref" text,
	"params" jsonb,
	"ogl_attribution" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"role" "station_role" DEFAULT 'primary' NOT NULL,
	"distance_km" double precision,
	"elevation_diff_m" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "data_source" DEFAULT 'msc_geomet' NOT NULL,
	"stn_id" integer,
	"climate_id" text NOT NULL,
	"wmo_id" text,
	"tc_id" text,
	"station_name" text NOT NULL,
	"province" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"elevation_m" double precision,
	"first_year" integer,
	"last_year" integer,
	"record_length_years" integer,
	"available_collections" jsonb,
	"raw_metadata" jsonb,
	"catalog_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_pulls" ADD CONSTRAINT "data_pulls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pulls" ADD CONSTRAINT "data_pulls_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pulls" ADD CONSTRAINT "data_pulls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stations" ADD CONSTRAINT "project_stations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stations" ADD CONSTRAINT "project_stations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_pulls_project_idx" ON "data_pulls" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "data_pulls_station_idx" ON "data_pulls" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "data_pulls_cache_key_idx" ON "data_pulls" USING btree ("cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stations_unique_idx" ON "project_stations" USING btree ("project_id","station_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_source_climate_id_idx" ON "stations" USING btree ("source","climate_id");--> statement-breakpoint
CREATE INDEX "stations_lat_lon_idx" ON "stations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "stations_province_idx" ON "stations" USING btree ("province");