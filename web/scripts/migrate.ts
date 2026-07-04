import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// Scripts run under plain Node (not Next), so load .env.local ourselves to
// share PGLITE_DATA_DIR with the dev server.
dotenv.config({ path: ".env.local" });

/**
 * Apply generated SQL migrations to the local PGlite database.
 * Run offline via: npm run db:migrate --workspace web
 */
async function main() {
  const dataDir =
    process.env.PGLITE_DATA_DIR ??
    path.join(process.cwd(), ".storage", "pgdata");
  const migrationsFolder = path.join(process.cwd(), "..", "drizzle", "migrations");

  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client);

  console.log(`Migrating PGlite at ${dataDir}`);
  await migrate(db, { migrationsFolder });
  await client.close();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
