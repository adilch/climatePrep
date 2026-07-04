import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

// Share PGLITE_DATA_DIR with the dev server (see migrate.ts).
dotenv.config({ path: ".env.local" });

/**
 * Seed the local database with a dev user so credentials login + project CRUD
 * work out of the box. Idempotent. Run: npm run db:seed --workspace web
 */
const DEV_EMAIL = process.env.AUTH_DEV_EMAIL ?? "dev@climateprep.local";
const DEV_NAME = "Dev Engineer";

async function main() {
  const dataDir =
    process.env.PGLITE_DATA_DIR ??
    path.join(process.cwd(), ".storage", "pgdata");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEV_EMAIL));

  if (existing.length === 0) {
    const [user] = await db
      .insert(schema.users)
      .values({ email: DEV_EMAIL, name: DEV_NAME, role: "engineer" })
      .returning();
    console.log(`Seeded dev user ${user.email} (${user.id})`);
  } else {
    console.log(`Dev user ${DEV_EMAIL} already present (${existing[0].id})`);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
