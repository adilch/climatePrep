import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { APP_VERSION } from "@/lib/version";
import { haversineKm } from "@/lib/stations/rank";
import {
  engineAggregate,
  engineInfill,
  engineTrend,
} from "@/lib/engine/client";
import { analysisInputHash } from "./input-hash";
import { annualSeries, dailyGrid, loadPullRows } from "./series";
import type { DataPull } from "@/lib/db/schema";

/**
 * QC orchestration (spec §3.2: engine computes, Node persists). Each run
 * creates an `analyses` row + `analysis_results` row carrying the full
 * provenance chain: upstream pull ids in the inputs, input_hash, seed,
 * engine + app versions (spec §5.2).
 */

async function completedPull(pullId: string): Promise<DataPull> {
  const [pull] = await db
    .select()
    .from(schema.dataPulls)
    .where(eq(schema.dataPulls.id, pullId))
    .limit(1);
  if (!pull || pull.status !== "complete") {
    throw new Error("pull_not_found_or_incomplete");
  }
  return pull;
}

async function persist(opts: {
  projectId: string;
  stationId: string | null;
  name: string;
  inputs: Record<string, unknown>;
  upstreamPullIds: string[];
  results: Record<string, unknown>;
  engineVersion: string;
  seed?: number | null;
  userId: string;
}) {
  const inputHash = analysisInputHash(opts.inputs, opts.upstreamPullIds);
  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      projectId: opts.projectId,
      stationId: opts.stationId,
      type: "qc",
      name: opts.name,
      status: "done",
      inputs: { ...opts.inputs, upstreamPullIds: opts.upstreamPullIds },
      inputHash,
      engineVersion: opts.engineVersion,
      appVersion: APP_VERSION,
      createdBy: opts.userId,
    })
    .returning();

  await db.insert(schema.analysisResults).values({
    analysisId: analysis.id,
    results: opts.results,
    seed: opts.seed ?? null,
    computedAt: new Date(),
    engineVersion: opts.engineVersion,
  });

  // QC progress advances the non-blocking state machine (spec §2.4).
  await db
    .update(schema.projects)
    .set({ status: "qa_complete", updatedAt: new Date() })
    .where(eq(schema.projects.id, opts.projectId));

  return analysis;
}

export async function runQcTrend(
  args: {
    projectId: string;
    pullId: string;
    seriesType: "annual_max" | "annual_total";
    element?: string;
    alpha?: number;
    seed?: number;
  },
  userId: string,
) {
  const pull = await completedPull(args.pullId);
  const rows = await loadPullRows(pull);
  const element = args.element ?? "TOTAL_PRECIPITATION";
  const { years, values, excluded } = annualSeries(rows, args.seriesType, element);
  if (values.length < 10) {
    throw new Error(
      `only ${values.length} usable years (≥10 required for trend tests)`,
    );
  }

  const seed = args.seed ?? 42;
  const inputs = {
    op: "trend",
    pullId: pull.id,
    seriesType: args.seriesType,
    element,
    alpha: args.alpha ?? 0.05,
    seed,
    years,
    excludedYears: excluded,
  };
  const res = await engineTrend({
    series: values,
    alpha: args.alpha ?? 0.05,
    mcSamples: 5000,
    seed,
  });

  const results = { ...res, years, series: values, excludedYears: excluded };
  const analysis = await persist({
    projectId: args.projectId,
    stationId: pull.stationId,
    name: `Trend/homogeneity — ${args.seriesType} ${element}`,
    inputs,
    upstreamPullIds: [pull.id],
    results,
    engineVersion: res.engineVersion,
    seed,
    userId,
  });
  return { analysis, results };
}

export async function runQcAggregate(
  args: {
    projectId: string;
    pullId: string;
    durationsHours: number[];
    applyCorrection: boolean;
    singleIntervalFactor?: number;
    minYearCompleteness?: number;
    element?: string;
  },
  userId: string,
) {
  const pull = await completedPull(args.pullId);
  const rows = await loadPullRows(pull);
  const element = args.element ?? "TOTAL_PRECIPITATION";
  const { dates, values } = dailyGrid(rows, element);
  if (dates.length === 0) throw new Error("no data in pull");

  // The single-interval (k=1) factor is the user-visible knob (spec B3).
  // The map sent to the engine is the COMPLETE table: a partial map would
  // silently apply the k=1 factor to larger windows via the nearest-smaller-
  // key fallback. Must mirror DEFAULT_CORRECTION_FACTORS in
  // core_engine/qc/aggregate.py (WMO-1045 / Weiss 1964).
  const WMO_DEFAULT_FACTORS: Record<number, number> = {
    1: 1.13, 2: 1.04, 3: 1.03, 4: 1.02, 5: 1.02, 6: 1.02, 8: 1.01, 12: 1.01, 24: 1.01,
  };
  const correctionFactors =
    args.singleIntervalFactor != null
      ? { ...WMO_DEFAULT_FACTORS, 1: args.singleIntervalFactor }
      : undefined;

  const inputs = {
    op: "aggregate",
    pullId: pull.id,
    element,
    durationsHours: args.durationsHours,
    applyCorrection: args.applyCorrection,
    singleIntervalFactor: args.singleIntervalFactor ?? 1.13,
    minYearCompleteness: args.minYearCompleteness ?? 0.8,
  };
  const res = await engineAggregate({
    timestamps: dates.map((d) => `${d}T00:00:00`),
    values,
    intervalHours: 24,
    durationsHours: args.durationsHours,
    applyCorrection: args.applyCorrection,
    correctionFactors,
    minYearCompleteness: args.minYearCompleteness ?? 0.8,
  });

  const analysis = await persist({
    projectId: args.projectId,
    stationId: pull.stationId,
    name: `AMS aggregation — ${element}`,
    inputs,
    upstreamPullIds: [pull.id],
    results: res,
    engineVersion: res.engineVersion,
    userId,
  });
  return { analysis, results: res };
}

export async function runQcInfill(
  args: {
    projectId: string;
    targetPullId: string;
    neighbourPullIds: string[];
    method: "normal_ratio" | "idw" | "regression";
    element?: string;
  },
  userId: string,
) {
  const target = await completedPull(args.targetPullId);
  if (args.neighbourPullIds.length === 0) {
    throw new Error("at least one neighbour pull required");
  }
  const neighbourPulls = await db
    .select()
    .from(schema.dataPulls)
    .where(inArray(schema.dataPulls.id, args.neighbourPullIds));
  if (neighbourPulls.length !== args.neighbourPullIds.length) {
    throw new Error("neighbour pull not found");
  }

  const element = args.element ?? "TOTAL_PRECIPITATION";
  const targetRows = await loadPullRows(target);
  const grid = dailyGrid(targetRows, element);

  const stationIds = [target.stationId, ...neighbourPulls.map((p) => p.stationId)];
  const stations = await db
    .select()
    .from(schema.stations)
    .where(inArray(schema.stations.id, stationIds));
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const targetStation = stationById.get(target.stationId)!;

  const neighbours = [];
  for (const np of neighbourPulls) {
    const s = stationById.get(np.stationId)!;
    const nRows = await loadPullRows(np);
    const nGrid = dailyGrid(nRows, element);
    const nMap = new Map(nGrid.dates.map((d, i) => [d, nGrid.values[i]]));
    neighbours.push({
      id: s.climateId,
      name: s.stationName,
      distanceKm: Math.max(
        0.1,
        haversineKm(
          targetStation.latitude,
          targetStation.longitude,
          s.latitude,
          s.longitude,
        ),
      ),
      values: grid.dates.map((d) => nMap.get(d) ?? null),
    });
  }

  const inputs = {
    op: "infill",
    targetPullId: target.id,
    neighbourPullIds: args.neighbourPullIds,
    method: args.method,
    element,
  };
  const res = await engineInfill({
    dates: grid.dates,
    target: grid.values,
    neighbours,
    method: args.method,
  });

  const analysis = await persist({
    projectId: args.projectId,
    stationId: target.stationId,
    name: `Infilling (${args.method}) — ${element}`,
    inputs,
    upstreamPullIds: [target.id, ...args.neighbourPullIds],
    results: res,
    engineVersion: res.engineVersion,
    userId,
  });
  return { analysis, results: res };
}
