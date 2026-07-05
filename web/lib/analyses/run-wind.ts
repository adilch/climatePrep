import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { APP_VERSION } from "@/lib/version";
import { analysisInputHash } from "./input-hash";
import { loadPullRows } from "./series";
import type {
  FetchWaveResponse,
  FreeboardResponse,
  WindResponse,
} from "@climateprep/core-ts";

/**
 * Wind & freeboard orchestration (spec F/G, M6). Chains:
 *   hourly pull → annual-max hourly wind AMS (+ rose sample) → engine /wind
 *   daily pull  → annual-max gust AMS → engine /wind
 *   site polygon + wind → engine /fetch-wave + /freeboard
 */

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

async function enginePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`engine ${res.status} on ${path}: ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Annual maxima of an element from HOURLY rows (max over all hours/year). */
function hourlyAnnualMax(
  rows: Record<string, unknown>[],
  element: string,
  minHoursPerYear = 6000,
): { years: number[]; values: number[] } {
  const byYear = new Map<number, { max: number; count: number }>();
  for (const r of rows) {
    const y = Number(r.LOCAL_YEAR);
    const v = r[element];
    if (!Number.isFinite(y)) continue;
    let acc = byYear.get(y);
    if (!acc) {
      acc = { max: -Infinity, count: 0 };
      byYear.set(y, acc);
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      acc.count += 1;
      if (v > acc.max) acc.max = v;
    }
  }
  const years: number[] = [];
  const values: number[] = [];
  for (const [y, acc] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (acc.count >= minHoursPerYear && acc.max > 0) {
      years.push(y);
      values.push(acc.max);
    }
  }
  return { years, values };
}

/** Annual maxima of a DAILY element (e.g. SPEED_MAX_GUST). */
function dailyAnnualMax(
  rows: Record<string, unknown>[],
  element: string,
  minDaysPerYear = 292,
): { years: number[]; values: number[] } {
  const byYear = new Map<number, { max: number; count: number }>();
  for (const r of rows) {
    const y = Number(r.LOCAL_YEAR);
    const v = r[element];
    if (!Number.isFinite(y)) continue;
    let acc = byYear.get(y);
    if (!acc) {
      acc = { max: -Infinity, count: 0 };
      byYear.set(y, acc);
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      acc.count += 1;
      if (v > acc.max) acc.max = v;
    }
  }
  const years: number[] = [];
  const values: number[] = [];
  for (const [y, acc] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (acc.count >= minDaysPerYear && acc.max > 0) {
      years.push(y);
      values.push(acc.max);
    }
  }
  return { years, values };
}

export async function runWindAnalysis(
  args: { projectId: string; pullId: string; source: "hourly_wind" | "daily_gust" },
  userId: string,
) {
  const [pull] = await db
    .select()
    .from(schema.dataPulls)
    .where(eq(schema.dataPulls.id, args.pullId))
    .limit(1);
  if (!pull || pull.status !== "complete") throw new Error("pull_not_found_or_incomplete");

  const rows = await loadPullRows(pull);
  let series: { years: number[]; values: number[] };
  let label: string;
  let rose: { speeds: (number | null)[]; dirs: (number | null)[] } | null = null;

  if (args.source === "hourly_wind") {
    if (pull.collection !== "climate-hourly") {
      throw new Error("hourly_wind requires a climate-hourly pull");
    }
    series = hourlyAnnualMax(rows, "WIND_SPEED");
    label = "annual max hourly wind";
    rose = {
      speeds: rows.map((r) =>
        typeof r.WIND_SPEED === "number" ? (r.WIND_SPEED as number) : null,
      ),
      // GeoMet hourly WIND_DIRECTION is in tens of degrees.
      dirs: rows.map((r) =>
        typeof r.WIND_DIRECTION === "number"
          ? ((r.WIND_DIRECTION as number) * 10) % 360
          : null,
      ),
    };
  } else {
    if (pull.collection !== "climate-daily") {
      throw new Error("daily_gust requires a climate-daily pull");
    }
    series = dailyAnnualMax(rows, "SPEED_MAX_GUST");
    label = "annual max gust";
  }

  if (series.values.length < 5) {
    throw new Error(
      `only ${series.values.length} usable years of ${label} — need ≥ 5`,
    );
  }

  const request = {
    series: series.years.map((y, i) => ({ year: y, value: series.values[i] })),
    label,
    returnPeriods: [2, 10, 25, 50, 100, 200, 1000],
    bootstrapN: 1000,
    seed: 42,
    roseSpeedsKmh: rose?.speeds ?? null,
    roseDirectionsDeg: rose?.dirs ?? null,
  };
  const inputs = { op: "wind", pullId: pull.id, source: args.source, seed: 42, years: series.years };
  const res = await enginePost<WindResponse>("/api/engine/wind", request);

  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      projectId: args.projectId,
      stationId: pull.stationId,
      type: "wind",
      name: `Extreme wind — ${label}`,
      status: "done",
      inputs: { ...inputs, upstreamPullIds: [pull.id] },
      inputHash: analysisInputHash(inputs, [pull.id]),
      engineVersion: res.engineVersion,
      appVersion: APP_VERSION,
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.analysisResults).values({
    analysisId: analysis.id,
    results: res as unknown as Record<string, unknown>,
    seed: 42,
    computedAt: new Date(),
    engineVersion: res.engineVersion,
  });

  return { analysis, results: res };
}

export async function runFreeboardAnalysis(
  args: {
    projectId: string;
    windTowardDeg: number;
    uLandMs: number;
    avgDepthM: number;
    slopeVPerH: number;
    gammaF: number;
    waveMethod: "smb" | "spm84";
    runupMethod: "taw2002" | "hunt";
    allowancesM: Record<string, number>;
    windAnalysisId?: string | null; // provenance link when speed came from extremes
  },
  userId: string,
) {
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.projectId, args.projectId))
    .limit(1);
  if (!site?.latitude || !site.longitude) throw new Error("site_not_set");
  const polygon = site.reservoirPolygon as [number, number][] | null;
  if (!polygon || polygon.length < 3) {
    throw new Error("reservoir polygon not drawn — draw it on the map first");
  }

  const fetchWave = await enginePost<FetchWaveResponse>("/api/engine/fetch-wave", {
    siteLat: site.latitude,
    siteLon: site.longitude,
    polygonLonLat: polygon,
    windTowardDeg: args.windTowardDeg,
    uLandMs: args.uLandMs,
    avgDepthM: args.avgDepthM,
    waveMethod: args.waveMethod,
    directionalScan: true,
  });

  const effectiveFetchKm = (fetchWave.fetch as { effectiveFetchKm: number })
    .effectiveFetchKm;

  const freeboard = await enginePost<FreeboardResponse>("/api/engine/freeboard", {
    uLandMs: args.uLandMs,
    fetchKm: effectiveFetchKm,
    avgDepthM: args.avgDepthM,
    slopeVPerH: args.slopeVPerH,
    gammaF: args.gammaF,
    waveMethod: args.waveMethod,
    runupMethod: args.runupMethod,
    allowancesM: args.allowancesM,
  });

  const inputs = {
    op: "freeboard",
    windTowardDeg: args.windTowardDeg,
    uLandMs: args.uLandMs,
    avgDepthM: args.avgDepthM,
    slopeVPerH: args.slopeVPerH,
    gammaF: args.gammaF,
    waveMethod: args.waveMethod,
    runupMethod: args.runupMethod,
    allowancesM: args.allowancesM,
    windAnalysisId: args.windAnalysisId ?? null,
    polygonVertices: polygon.length,
  };
  const results = { fetchWave, freeboard };

  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      projectId: args.projectId,
      stationId: null,
      type: "freeboard",
      name: `Freeboard — dir ${args.windTowardDeg}°, U ${args.uLandMs} m/s`,
      status: "done",
      inputs,
      inputHash: analysisInputHash(inputs, args.windAnalysisId ? [args.windAnalysisId] : []),
      engineVersion: freeboard.engineVersion,
      appVersion: APP_VERSION,
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.analysisResults).values({
    analysisId: analysis.id,
    results: results as unknown as Record<string, unknown>,
    computedAt: new Date(),
    engineVersion: freeboard.engineVersion,
  });

  return { analysis, results };
}
