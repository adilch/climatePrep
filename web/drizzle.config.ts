import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. `generate` is schema-first and needs no DB connection,
 * so migrations are produced offline. They are applied to PGlite locally via
 * the programmatic migrator in scripts/migrate.ts (and to Postgres in deploy).
 * Migrations live at the repo root per spec §3.9.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "../drizzle/migrations",
});
