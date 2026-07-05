import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { APP_VERSION } from "@/lib/version";
import { engineDesignStorm, enginePmp } from "@/lib/engine/client";
import { analysisInputHash } from "./input-hash";
import type { DesignStormResponse, PmpResponse } from "@climateprep/core-ts";

/**
 * PMP + design-storm orchestration (spec D/E, M5). Provenance chains:
 *   pull → QC AMS → PMP        (hershfield on a duration's corrected AMS)
 *   pull → QC → PFA → storm    (chicago/alt_block from the fitted IDF)
 *   pull → QC → PMP → storm    (pmp hyetograph)
 */

interface QcAmsResults {
  durations: {
    durationHours: number;
    kIntervals: number;
    ams: { year: number; value: number }[];
  }[];
}

export async function runPmpAnalysis(
  args: {
    projectId: string;
    qcAnalysisId: string;
    durationHours: number;
    areaKm2?: number | null;
    kmOverride?: number | null;
    applyOutlierAdjustment?: boolean;
    applyLengthAdjustment?: boolean;
    applyIntervalAdjustment?: boolean;
  },
  userId: string,
) {
  const [qc] = await db
    .select({ analysis: schema.analyses, result: schema.analysisResults })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .where(
      and(eq(schema.analyses.id, args.qcAnalysisId), eq(schema.analyses.type, "qc")),
    )
    .limit(1);
  if (!qc) throw new Error("qc_analysis_not_found");

  const qcResults = qc.result.results as unknown as QcAmsResults;
  const dur = qcResults.durations?.find(
    (d) => d.durationHours === args.durationHours,
  );
  if (!dur) throw new Error(`duration ${args.durationHours} h not in QC analysis`);
  if (dur.ams.length < 10) {
    throw new Error(`only ${dur.ams.length} AMS years — WMO-1045 requires ≥10`);
  }

  // The QC AMS is already interval-corrected (M2). Applying Fig 4.5 again
  // would double-correct — pass the RAW values and let the PMP chain own the
  // interval step, so the report shows it once, explicitly.
  const rawSeries = dur.ams.map((p) =>
    "valueRaw" in p ? (p as { valueRaw: number }).valueRaw : p.value,
  );

  const request = {
    series: rawSeries,
    durationHours: args.durationHours,
    nObsUnits: dur.kIntervals ?? 1,
    areaKm2: args.areaKm2 ?? null,
    kmOverride: args.kmOverride ?? null,
    applyOutlierAdjustment: args.applyOutlierAdjustment ?? true,
    applyLengthAdjustment: args.applyLengthAdjustment ?? true,
    applyIntervalAdjustment: args.applyIntervalAdjustment ?? true,
    dadAreasKm2: [25, 100, 200, 500, 1000],
  };

  const upstreamPullIds =
    ((qc.analysis.inputs as Record<string, unknown>).upstreamPullIds as string[]) ??
    [];
  const inputs = { op: "pmp", qcAnalysisId: args.qcAnalysisId, ...request };
  const res: PmpResponse = await enginePmp(request);

  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      projectId: args.projectId,
      stationId: qc.analysis.stationId,
      type: "pmp",
      name: `PMP (Hershfield) — ${args.durationHours} h`,
      status: "done",
      inputs: { ...inputs, upstreamPullIds },
      inputHash: analysisInputHash(inputs, [...upstreamPullIds, args.qcAnalysisId]),
      engineVersion: res.engineVersion,
      appVersion: APP_VERSION,
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.analysisResults).values({
    analysisId: analysis.id,
    results: res as unknown as Record<string, unknown>,
    computedAt: new Date(),
    engineVersion: res.engineVersion,
  });

  return { analysis, results: res };
}

export async function runStormAnalysis(
  args: {
    projectId: string;
    pattern: "chicago" | "alt_block" | "scs_type2" | "pmp";
    dtHours: number;
    durationHours: number;
    peakRatio: number;
    sourceAnalysisId?: string | null; // pfa (chicago/alt_block) or pmp (pmp)
    returnPeriod?: number | null;     // for IDF-based patterns
    totalDepthMm?: number | null;     // scs_type2
  },
  userId: string,
) {
  let idf: { durationsHours: number[]; intensitiesMmHr: number[] } | null = null;
  let pmp24hMm: number | null = null;
  let stationId: string | null = null;
  let upstream: string[] = [];

  if (args.pattern === "chicago" || args.pattern === "alt_block") {
    if (!args.sourceAnalysisId || !args.returnPeriod) {
      throw new Error("IDF-based patterns need a PFA analysis + return period");
    }
    const [pfa] = await db
      .select({ analysis: schema.analyses, result: schema.analysisResults })
      .from(schema.analyses)
      .innerJoin(
        schema.analysisResults,
        eq(schema.analysisResults.analysisId, schema.analyses.id),
      )
      .where(
        and(
          eq(schema.analyses.id, args.sourceAnalysisId),
          eq(schema.analyses.type, "pfa"),
        ),
      )
      .limit(1);
    if (!pfa) throw new Error("pfa_analysis_not_found");
    const results = pfa.result.results as {
      idf: {
        durationsHours: number[];
        returnPeriods: number[];
        cells: ({ intensity: number } | null)[][];
      };
    };
    const ti = results.idf.returnPeriods.indexOf(args.returnPeriod);
    if (ti === -1) throw new Error(`T=${args.returnPeriod} not in the PFA run`);
    const durations: number[] = [];
    const intensities: number[] = [];
    results.idf.durationsHours.forEach((d, di) => {
      const cell = results.idf.cells[di][ti];
      if (cell) {
        durations.push(d);
        intensities.push(cell.intensity);
      }
    });
    if (durations.length < 2) throw new Error("PFA has too few IDF durations");
    idf = { durationsHours: durations, intensitiesMmHr: intensities };
    stationId = pfa.analysis.stationId;
    upstream = [pfa.analysis.id];
  } else if (args.pattern === "pmp") {
    if (!args.sourceAnalysisId) throw new Error("pmp pattern needs a PMP analysis");
    const [pmpRow] = await db
      .select({ analysis: schema.analyses, result: schema.analysisResults })
      .from(schema.analyses)
      .innerJoin(
        schema.analysisResults,
        eq(schema.analysisResults.analysisId, schema.analyses.id),
      )
      .where(
        and(
          eq(schema.analyses.id, args.sourceAnalysisId),
          eq(schema.analyses.type, "pmp"),
        ),
      )
      .limit(1);
    if (!pmpRow) throw new Error("pmp_analysis_not_found");
    const r = pmpRow.result.results as { pmpTrueIntervalMm: number; durationHours: number };
    if (r.durationHours !== 24) {
      throw new Error("pmp hyetograph expects a 24-h PMP analysis");
    }
    pmp24hMm = r.pmpTrueIntervalMm;
    stationId = pmpRow.analysis.stationId;
    upstream = [pmpRow.analysis.id];
  } else if (args.pattern === "scs_type2" && !args.totalDepthMm) {
    throw new Error("scs_type2 requires totalDepthMm");
  }

  const request = {
    pattern: args.pattern,
    dtHours: args.dtHours,
    durationHours: args.durationHours,
    peakRatio: args.peakRatio,
    idf,
    totalDepthMm: args.totalDepthMm ?? null,
    pmp24hMm,
  };
  const inputs = {
    op: "design_storm",
    sourceAnalysisId: args.sourceAnalysisId ?? null,
    returnPeriod: args.returnPeriod ?? null,
    ...request,
  };
  const res: DesignStormResponse = await engineDesignStorm(request);

  const label =
    args.pattern === "pmp"
      ? `PMP hyetograph (${pmp24hMm?.toFixed(0)} mm)`
      : args.pattern === "scs_type2"
        ? `SCS Type II (${args.totalDepthMm} mm)`
        : `${args.pattern === "chicago" ? "Chicago" : "Alternating block"} T=${args.returnPeriod}`;

  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      projectId: args.projectId,
      stationId,
      type: "design_storm",
      name: `Design storm — ${label}`,
      status: "done",
      inputs,
      inputHash: analysisInputHash(inputs, upstream),
      engineVersion: res.engineVersion,
      appVersion: APP_VERSION,
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.analysisResults).values({
    analysisId: analysis.id,
    results: res as unknown as Record<string, unknown>,
    computedAt: new Date(),
    engineVersion: res.engineVersion,
  });

  return { analysis, results: res };
}
