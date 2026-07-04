import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { getPublishedIdf } from "@/lib/eccc/idf-published";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/stations/:id/published-idf — ECCC Engineering Climate Datasets
 * published IDF for the comparison panel (spec A3, K5). First call for a
 * province downloads + unpacks the archive into Blob (once, ~40 MB); later
 * calls are cache hits. 404-with-found:false when ECCC publishes none.
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
  if (!station.province) {
    return NextResponse.json({ found: false, reason: "no_province" });
  }

  try {
    const idf = await getPublishedIdf(station.climateId, station.province);
    if (!idf) {
      return NextResponse.json({
        found: false,
        reason: "not_published",
        note: "ECCC publishes IDF only for ~600 stations with tipping-bucket rain gauges.",
      });
    }
    return NextResponse.json({ found: true, idf });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
