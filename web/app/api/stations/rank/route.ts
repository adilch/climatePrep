import { NextResponse } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import {
  DEFAULT_RANK_PARAMS,
  rankStation,
} from "@/lib/stations/rank";

/**
 * GET /api/stations/rank?lat=&lon=&elev=&limit=
 * Ranked candidate stations around a site (spec A1): distance + record length
 * + elevation difference. Scans a lat/lon window from the local catalog, then
 * scores in memory — fast enough at catalog scale (~8.5 k rows).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const elev = params.get("elev") !== null ? Number(params.get("elev")) : null;
  const limit = Math.min(50, Number(params.get("limit") ?? 15));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon are required numbers" },
      { status: 400 },
    );
  }

  // Window: ±1.5° lat (~165 km); lon widened by cos(lat) to stay ~symmetric.
  const dLat = 1.5;
  const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  const candidates = await db
    .select()
    .from(schema.stations)
    .where(
      and(
        gte(schema.stations.latitude, lat - dLat),
        lte(schema.stations.latitude, lat + dLat),
        gte(schema.stations.longitude, lon - dLon),
        lte(schema.stations.longitude, lon + dLon),
      ),
    );

  const site = { latitude: lat, longitude: lon, elevationM: elev };
  const ranked = candidates
    .map((s) => ({
      station: {
        id: s.id,
        climateId: s.climateId,
        stationName: s.stationName,
        province: s.province,
        latitude: s.latitude,
        longitude: s.longitude,
        elevationM: s.elevationM,
        firstYear: s.firstYear,
        lastYear: s.lastYear,
        recordLengthYears: s.recordLengthYears,
        availableCollections: s.availableCollections,
      },
      rank: rankStation(site, s),
    }))
    .sort((a, b) => b.rank.score - a.rank.score)
    .slice(0, limit);

  return NextResponse.json({
    site,
    params: DEFAULT_RANK_PARAMS,
    candidates: ranked,
  });
}
