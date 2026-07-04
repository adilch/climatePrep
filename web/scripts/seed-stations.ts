import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { fetchStationCatalog } from "../lib/stations/catalog";

// Share PGLITE_DATA_DIR with the dev server.
dotenv.config({ path: ".env.local" });

/**
 * Seed / refresh the ECCC station catalog (spec §5.5, refreshable job).
 * Usage: npm run db:seed-stations --workspace web [-- --province AB]
 * Upserts on (source, climate_id) so re-runs update metadata in place.
 */
async function main() {
  const provinceArg = process.argv.indexOf("--province");
  const province =
    provinceArg !== -1 ? process.argv[provinceArg + 1]?.toUpperCase() : undefined;

  const dataDir =
    process.env.PGLITE_DATA_DIR ??
    path.join(process.cwd(), ".storage", "pgdata");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  console.log(
    `Fetching ECCC station catalog${province ? ` for ${province}` : " (all of Canada)"}…`,
  );
  const { rows, numberMatched, endpointUrl } = await fetchStationCatalog(province);
  console.log(`Fetched ${rows.length} stations (numberMatched=${numberMatched})`);
  console.log(`Source: ${endpointUrl}`);

  // Upsert in chunks (PGlite handles multi-row inserts fine; keep them modest).
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(schema.stations)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.stations.source, schema.stations.climateId],
        set: {
          stnId: sql`excluded.stn_id`,
          wmoId: sql`excluded.wmo_id`,
          tcId: sql`excluded.tc_id`,
          stationName: sql`excluded.station_name`,
          province: sql`excluded.province`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          elevationM: sql`excluded.elevation_m`,
          firstYear: sql`excluded.first_year`,
          lastYear: sql`excluded.last_year`,
          recordLengthYears: sql`excluded.record_length_years`,
          availableCollections: sql`excluded.available_collections`,
          rawMetadata: sql`excluded.raw_metadata`,
          catalogUpdatedAt: sql`excluded.catalog_updated_at`,
          updatedAt: sql`now()`,
        },
      });
    upserted += chunk.length;
    process.stdout.write(`  upserted ${upserted}/${rows.length}\r`);
  }
  console.log(`\nDone. ${upserted} stations in catalog.`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
