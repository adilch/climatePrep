import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { fetchAllFeaturesCached } from "@/lib/eccc/geomet";

type Ctx = { params: Promise<{ id: string }> };

interface SlimDaily {
  LOCAL_YEAR: number;
  LOCAL_MONTH: number;
  TOTAL_PRECIPITATION: number | null;
  MAX_TEMPERATURE: number | null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * GET /api/stations/:id/availability
 * Pre-commitment availability viz (spec A4): per-collection record timeline
 * (free, from catalog metadata) + a year×month missing-data heatmap computed
 * from a slim, cached climate-daily pull (properties= field selection keeps
 * the payload small — verified 2026-07-04).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const [station] = await db
    .select()
    .from(schema.stations)
    .where(eq(schema.stations.id, id))
    .limit(1);
  if (!station) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const avail = (station.availableCollections ?? {}) as Record<string, unknown>;

  // No daily record → timeline only.
  const daily = avail.daily as { first: string; last: string } | null;
  if (!daily) {
    return NextResponse.json({
      station: { id: station.id, climateId: station.climateId },
      timeline: avail,
      heatmap: null,
    });
  }

  const period = `${daily.first}/${daily.last}`;
  const { features, fromCache, cacheKey } =
    await fetchAllFeaturesCached<SlimDaily>(
      "daily",
      {
        filters: { CLIMATE_IDENTIFIER: station.climateId },
        datetime: period,
        properties: [
          "LOCAL_YEAR",
          "LOCAL_MONTH",
          "TOTAL_PRECIPITATION",
          "MAX_TEMPERATURE",
        ],
      },
      { climateId: station.climateId, period },
    );

  // year → month(1-12) → counts
  const counts = new Map<number, { precip: number[]; temp: number[]; obs: number[] }>();
  for (const f of features) {
    const { LOCAL_YEAR: y, LOCAL_MONTH: m } = f.properties;
    if (!y || !m) continue;
    let row = counts.get(y);
    if (!row) {
      row = {
        precip: new Array(12).fill(0),
        temp: new Array(12).fill(0),
        obs: new Array(12).fill(0),
      };
      counts.set(y, row);
    }
    row.obs[m - 1] += 1;
    if (f.properties.TOTAL_PRECIPITATION !== null) row.precip[m - 1] += 1;
    if (f.properties.MAX_TEMPERATURE !== null) row.temp[m - 1] += 1;
  }

  const years = [...counts.keys()].sort((a, b) => a - b);
  const heatmap = years.map((y) => {
    const row = counts.get(y)!;
    return {
      year: y,
      /** completeness fraction 0–1 per month, by element */
      precip: row.precip.map((c, i) =>
        Number((c / daysInMonth(y, i + 1)).toFixed(3)),
      ),
      temp: row.temp.map((c, i) =>
        Number((c / daysInMonth(y, i + 1)).toFixed(3)),
      ),
    };
  });

  return NextResponse.json({
    station: {
      id: station.id,
      climateId: station.climateId,
      stationName: station.stationName,
    },
    timeline: avail,
    heatmap,
    provenance: { cacheKey, fromCache, rowCount: features.length },
  });
}
