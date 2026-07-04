import {
  boolean,
  doublePrecision,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type User = typeof users.$inferSelect;
