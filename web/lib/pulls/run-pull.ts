import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { fetchAllFeaturesCached } from "@/lib/eccc/geomet";
import { COLLECTIONS, type CollectionKey } from "@/lib/eccc/types";
import * as blob from "@/lib/storage/blob";
import type { DataPull, Station } from "@/lib/db/schema";

/**
 * Execute a data pull with full provenance capture (spec A5, §5.1):
 * fetch (cached, rate-limited) → raw series to Blob under the spec §5.4
 * layout → append-only data_pulls row. Rows are never deleted; a failed pull
 * is recorded with status 'error'.
 */

export interface PullRequestInput {
  projectId?: string | null;
  stationId: string;
  collection: CollectionKey;
  periodStart?: string | null; // YYYY-MM-DD
  periodEnd?: string | null;
}

/** Identifier filter differs by family (verified 2026-07-04). */
function identifierFilter(
  collection: CollectionKey,
  station: Station,
): Record<string, string> {
  if (collection.startsWith("ahccd")) {
    return { station_id__id_station: station.climateId };
  }
  return { CLIMATE_IDENTIFIER: station.climateId };
}

/** Collections that accept an OGC datetime range. */
function supportsDatetime(collection: CollectionKey): boolean {
  return ["daily", "hourly", "monthly"].includes(collection);
}

function sortField(collection: CollectionKey): string | undefined {
  if (["daily", "hourly", "monthly"].includes(collection)) return "LOCAL_DATE";
  if (collection === "ahccdAnnual") return "year__annee";
  return undefined;
}

export interface PullResult {
  pull: DataPull;
  preview: Record<string, unknown>[];
  fromCache: boolean;
}

export async function runPull(
  input: PullRequestInput,
  userId: string,
): Promise<PullResult> {
  const [station] = await db
    .select()
    .from(schema.stations)
    .where(eq(schema.stations.id, input.stationId))
    .limit(1);
  if (!station) throw new Error("station_not_found");

  const collectionId = COLLECTIONS[input.collection];
  const period =
    input.periodStart && input.periodEnd
      ? `${input.periodStart}/${input.periodEnd}`
      : null;

  const requestedAt = new Date();
  const source = input.collection.startsWith("ahccd") ? "ahccd" : "msc_geomet";

  // Append-only provenance row, created up front so even failures are recorded.
  const [pending] = await db
    .insert(schema.dataPulls)
    .values({
      projectId: input.projectId ?? null,
      stationId: station.id,
      source,
      endpointUrl: "", // set on completion (first-page URL)
      collection: collectionId,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      requestedAt,
      status: "running",
      params: {
        collectionKey: input.collection,
        climateId: station.climateId,
        period,
      },
      oglAttribution: true,
      createdBy: userId,
    })
    .returning();

  try {
    const result = await fetchAllFeaturesCached(
      input.collection,
      {
        filters: identifierFilter(input.collection, station),
        ...(period && supportsDatetime(input.collection)
          ? { datetime: period }
          : {}),
        ...(sortField(input.collection)
          ? { sortby: sortField(input.collection) }
          : {}),
      },
      { climateId: station.climateId, period: period ?? undefined },
    );

    // Raw series into Blob under the spec §5.4 layout.
    const periodLabel = period ? period.replaceAll("/", "_") : "full";
    const blobKey = `raw/${station.climateId}/${collectionId}/${periodLabel}.json`;
    const rows = result.features.map((f) => f.properties);
    await blob.put(
      blobKey,
      JSON.stringify({
        provenance: {
          source,
          collection: collectionId,
          climateId: station.climateId,
          stationName: station.stationName,
          endpointUrl: result.endpointUrl,
          requestedAt: requestedAt.toISOString(),
          fetchedAt: result.fetchedAt,
          rowCount: rows.length,
          oglAttribution: true,
        },
        rows,
      }),
    );

    const [pull] = await db
      .update(schema.dataPulls)
      .set({
        status: "complete",
        completedAt: new Date(),
        endpointUrl: result.endpointUrl,
        rowCount: rows.length,
        cacheKey: result.cacheKey,
        blobRef: blobKey,
        updatedAt: new Date(),
      })
      .where(eq(schema.dataPulls.id, pending.id))
      .returning();

    // First successful pull advances the project state machine (spec §2.4).
    if (input.projectId) {
      await db
        .update(schema.projects)
        .set({ status: "data_acquired", updatedAt: new Date() })
        .where(eq(schema.projects.id, input.projectId));
    }

    return { pull, preview: rows.slice(0, 25), fromCache: result.fromCache };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.dataPulls)
      .set({ status: "error", error: message, updatedAt: new Date() })
      .where(eq(schema.dataPulls.id, pending.id));
    throw err;
  }
}
