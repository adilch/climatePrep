import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { APP_VERSION } from "@/lib/version";
import { enginePfa } from "@/lib/engine/client";
import { analysisInputHash } from "./input-hash";
import type { PfaResponse } from "@climateprep/core-ts";

/**
 * PFA orchestration (spec C, M3). Input is a completed QC "AMS aggregation"
 * analysis — the provenance chain stays linear:
 *   data_pull → qc aggregate (correction logged) → pfa (this) → report.
 * The corrected AMS values feed the fits; whether correction was applied is
 * part of the chain and echoed into the PFA inputs.
 */

export interface RunPfaArgs {
  projectId: string;
  qcAnalysisId: string;
  distributions?: ("gumbel" | "gev" | "glo" | "pe3" | "lp3")[];
  estimationMethod?: "lmoments" | "mom" | "mle";
  returnPeriods?: number[];
  bootstrapN?: number;
  ciLevel?: number;
  seed?: number;
  idfDistribution?: "gumbel" | "gev" | "glo" | "pe3" | "lp3";
}

interface QcAmsResults {
  durations: {
    durationHours: number;
    correctionApplied: boolean;
    correctionFactor: number;
    ams: { year: number; value: number }[];
  }[];
}

export async function runPfaAnalysis(args: RunPfaArgs, userId: string) {
  const [qc] = await db
    .select({ analysis: schema.analyses, result: schema.analysisResults })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .where(
      and(
        eq(schema.analyses.id, args.qcAnalysisId),
        eq(schema.analyses.type, "qc"),
      ),
    )
    .limit(1);
  if (!qc) throw new Error("qc_analysis_not_found");

  const qcResults = qc.result.results as unknown as QcAmsResults;
  if (!qcResults.durations?.length) {
    throw new Error("selected QC analysis holds no AMS durations");
  }

  const durations = qcResults.durations
    .filter((d) => d.ams.length >= 5)
    .map((d) => ({
      durationHours: d.durationHours,
      series: d.ams.map((p) => ({ year: p.year, value: p.value })),
    }));
  if (durations.length === 0) {
    throw new Error("no duration has the minimum 5 AMS years");
  }

  const upstreamPullIds =
    ((qc.analysis.inputs as Record<string, unknown>).upstreamPullIds as string[]) ??
    [];

  const request = {
    durations,
    distributions: args.distributions ?? ["gumbel", "gev", "glo", "pe3", "lp3"],
    estimationMethod: args.estimationMethod ?? "lmoments",
    plottingPosition: "cunnane" as const,
    returnPeriods:
      args.returnPeriods ?? [2, 5, 10, 25, 50, 100, 200, 500, 1000, 10000],
    bootstrap: {
      n: args.bootstrapN ?? 2000,
      ci: args.ciLevel ?? 0.9,
      seed: args.seed ?? 42,
    },
    idfDistribution: args.idfDistribution ?? ("gumbel" as const),
  };

  const inputs = {
    op: "pfa",
    qcAnalysisId: args.qcAnalysisId,
    correctionApplied: qcResults.durations[0]?.correctionApplied ?? null,
    ...request,
  };
  const inputHash = analysisInputHash(inputs, [
    ...upstreamPullIds,
    args.qcAnalysisId,
  ]);

  const res: PfaResponse = await enginePfa(request);

  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      projectId: args.projectId,
      stationId: qc.analysis.stationId,
      type: "pfa",
      name: `PFA/IDF — ${durations.map((d) => `${d.durationHours}h`).join("/")}`,
      status: "done",
      inputs: { ...inputs, upstreamPullIds },
      inputHash,
      engineVersion: res.engineVersion,
      appVersion: APP_VERSION,
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.analysisResults).values({
    analysisId: analysis.id,
    results: res as unknown as Record<string, unknown>,
    seed: request.bootstrap.seed,
    computedAt: new Date(),
    engineVersion: res.engineVersion,
  });

  await db
    .update(schema.projects)
    .set({ status: "analyses_in_progress", updatedAt: new Date() })
    .where(eq(schema.projects.id, args.projectId));

  return { analysis, results: res };
}
