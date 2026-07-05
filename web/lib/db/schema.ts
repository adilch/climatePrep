import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * climatePrep relational schema (spec §5). M0 covers the core project spine:
 * users, organizations, projects, dams, sites. Provenance-heavy tables
 * (stations, data_pulls, analyses, results, jobs, audit_log) land in M1+.
 *
 * Written for Postgres; runs locally on PGlite (embedded Postgres, same SQL)
 * and swaps to Neon/Vercel Postgres for deploy with no schema change.
 */

// --- Enums -------------------------------------------------------------------

export const projectStatus = pgEnum("project_status", [
  "draft",
  "data_acquired",
  "qa_complete",
  "analyses_in_progress",
  "report_ready",
]);

export const cdaConsequenceCategory = pgEnum("cda_consequence_category", [
  "low",
  "significant",
  "high",
  "very_high",
  "extreme",
]);

export const dataSource = pgEnum("data_source", [
  "msc_geomet",
  "datamart",
  "bulk_csv",
  "ahccd",
  "eng_climate",
]);

export const stationRole = pgEnum("station_role", [
  "primary",
  "supporting",
  "wind",
  "comparison",
]);

export const pullStatus = pgEnum("pull_status", [
  "pending",
  "running",
  "complete",
  "error",
]);

export const analysisType = pgEnum("analysis_type", [
  "qc",
  "pfa",
  "pmp",
  "design_storm",
  "wind",
  "freeboard",
  "snowmelt",
  "regional",
]);

export const analysisStatus = pgEnum("analysis_status", [
  "queued",
  "running",
  "done",
  "stale",
  "error",
]);

export const reportFormat = pgEnum("report_format", [
  "docx",
  "pdf",
  "xlsx",
  "model_forcing",
]);

// --- Shared timestamp columns ------------------------------------------------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

// --- Tables ------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  orgId: uuid("org_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  role: text("role").notNull().default("engineer"),
  ...timestamps,
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: projectStatus("status").notNull().default("draft"),
  appVersionCreated: text("app_version_created").notNull(),
  ...timestamps,
});

export const dams = pgTable("dams", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  owner: text("owner"),
  jurisdiction: text("jurisdiction").notNull().default("AB"),
  cdaConsequenceCategory: cdaConsequenceCategory("cda_consequence_category"),
  classificationNotes: text("classification_notes"),
  ...timestamps,
});

export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  elevationM: doublePrecision("elevation_m"),
  reservoirPolygon: jsonb("reservoir_polygon"),
  datum: text("datum"),
  oglAttribution: boolean("ogl_attribution").notNull().default(true),
  ...timestamps,
});

/**
 * Station catalog + cached metadata (spec §5.1). Seeded from the GeoMet
 * `climate-stations` collection (refreshable). Coordinates come from the
 * GeoJSON geometry (decimal degrees) — the raw LATITUDE/LONGITUDE properties
 * are scaled integers and must not be used directly.
 */
export const stations = pgTable(
  "stations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: dataSource("source").notNull().default("msc_geomet"),
    /** GeoMet numeric STN_ID — also the legacy bulk-CSV `stationID`. */
    stnId: integer("stn_id"),
    climateId: text("climate_id").notNull(),
    wmoId: text("wmo_id"),
    tcId: text("tc_id"),
    stationName: text("station_name").notNull(),
    province: text("province"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    elevationM: doublePrecision("elevation_m"),
    firstYear: integer("first_year"),
    lastYear: integer("last_year"),
    recordLengthYears: integer("record_length_years"),
    /** Per-collection availability: {daily:{first,last}, hourly:{...}, monthly:{...}, normals:bool} */
    availableCollections: jsonb("available_collections"),
    rawMetadata: jsonb("raw_metadata"),
    catalogUpdatedAt: timestamp("catalog_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stations_source_climate_id_idx").on(t.source, t.climateId),
    // Supports the lat/lon window scan used by spatial ranking (spec §5.1).
    index("stations_lat_lon_idx").on(t.latitude, t.longitude),
    index("stations_province_idx").on(t.province),
  ],
);

/** Join: a project may use several stations in different roles (spec §5.1). */
export const projectStations = pgTable(
  "project_stations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    role: stationRole("role").notNull().default("primary"),
    distanceKm: doublePrecision("distance_km"),
    elevationDiffM: doublePrecision("elevation_diff_m"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("project_stations_unique_idx").on(
      t.projectId,
      t.stationId,
      t.role,
    ),
  ],
);

/**
 * Provenance of every ingestion (spec §5.1). Append-only: rows are NEVER
 * deleted or updated after completion — the provenance appendix in exports is
 * generated from this chain (spec §5.2).
 */
export const dataPulls = pgTable(
  "data_pulls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id),
    source: dataSource("source").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    collection: text("collection").notNull(),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rowCount: integer("row_count"),
    status: pullStatus("status").notNull().default("pending"),
    error: text("error"),
    cacheKey: text("cache_key"),
    /** Blob key of the raw series: raw/{climate_id}/{collection}/{period}.json */
    blobRef: text("blob_ref"),
    params: jsonb("params"),
    oglAttribution: boolean("ogl_attribution").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("data_pulls_project_idx").on(t.projectId),
    index("data_pulls_station_idx").on(t.stationId),
    index("data_pulls_cache_key_idx").on(t.cacheKey),
  ],
);

/**
 * Analyses — polymorphic across modules (spec §5.1). `input_hash` is the
 * deterministic hash of inputs + upstream data_pull ids: it powers cache hits
 * and staleness detection (upstream change → dependent analyses marked stale,
 * never silently re-served — spec §2.4, §9).
 */
export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    stationId: uuid("station_id").references(() => stations.id),
    type: analysisType("type").notNull(),
    name: text("name").notNull(),
    status: analysisStatus("status").notNull().default("queued"),
    inputs: jsonb("inputs").notNull(),
    inputHash: text("input_hash").notNull(),
    engineVersion: text("engine_version"),
    appVersion: text("app_version").notNull(),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("analyses_project_idx").on(t.projectId),
    index("analyses_input_hash_idx").on(t.inputHash),
  ],
);

export const analysisResults = pgTable(
  "analysis_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    results: jsonb("results").notNull(),
    figures: jsonb("figures"), // [{name, blob_ref}]
    seed: integer("seed"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    engineVersion: text("engine_version").notNull(),
    ...timestamps,
  },
  (t) => [index("analysis_results_analysis_idx").on(t.analysisId)],
);

/**
 * Generated deliverables (spec §5.1 report_documents). The file itself lives
 * in Blob (spec §5.4 exports/); this row carries what was generated, from
 * which analysis, and under which app/engine versions.
 */
export const reportDocuments = pgTable(
  "report_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id").references(() => analyses.id, {
      onDelete: "set null",
    }),
    format: reportFormat("format").notNull(),
    blobRef: text("blob_ref").notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size"),
    sections: jsonb("sections"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    appVersion: text("app_version").notNull(),
    engineVersion: text("engine_version"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("report_documents_project_idx").on(t.projectId)],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type ReportDocument = typeof reportDocuments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;
export type ProjectStation = typeof projectStations.$inferSelect;
export type DataPull = typeof dataPulls.$inferSelect;
export type NewDataPull = typeof dataPulls.$inferInsert;
