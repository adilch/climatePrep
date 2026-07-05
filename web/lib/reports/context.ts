import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { APP_VERSION } from "@/lib/version";
import { getPublishedIdf, type PublishedIdf } from "@/lib/eccc/idf-published";
import type { PfaResponse } from "@climateprep/core-ts";
import type {
  Analysis,
  DataPull,
  Project,
  Station,
} from "@/lib/db/schema";

/**
 * Report context (spec K1–K6): everything a deliverable needs, assembled once
 * and consumed by the xlsx/docx/pdf builders. The provenance appendix is
 * generated from this chain (spec §5.2) — if a link is missing, assembly
 * FAILS rather than emitting an export with an incomplete chain.
 */

export interface ReportFigure {
  name: string;
  png: Buffer;
  caption: string;
}

export interface ReportContext {
  project: Project;
  dam: { name: string; owner: string | null; cdaCategory: string | null } | null;
  site: { latitude: number; longitude: number; elevationM: number | null } | null;
  station: Station;
  pfaAnalysis: Analysis;
  pfa: PfaResponse;
  qcAnalysis: Analysis;
  qcInputs: Record<string, unknown>;
  /** QC AMS results: per-duration raw+corrected values, factors, skipped years. */
  qcAms: {
    durationHours: number;
    correctionApplied: boolean;
    correctionFactor: number;
    ams: { year: number; valueRaw: number; value: number; completeness: number }[];
    yearsSkipped: { year: number; reason: string }[];
  }[];
  pulls: DataPull[];
  published: PublishedIdf | null;
  figures: ReportFigure[];
  generatedAt: Date;
  appVersion: string;
  engineVersion: string;
  seed: number;
}

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

async function fetchFigures(
  pfa: PfaResponse,
  published: PublishedIdf | null,
  station: Station,
  seed: number,
): Promise<ReportFigure[]> {
  const res = await fetch(`${ENGINE_URL}/api/engine/figures/pfa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pfa,
      published,
      meta: {
        stationName: station.stationName,
        climateId: station.climateId,
        seed,
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`figure rendering failed: engine ${res.status}`);
  }
  const body = (await res.json()) as {
    figures: { name: string; pngBase64: string }[];
  };

  const captionFor = (name: string): string => {
    if (name.startsWith("frequency_")) {
      const dur = name.replace("frequency_", "").replace("h", "");
      return `Precipitation frequency curves, ${dur} h duration, with ${Math.round(
        (pfa.durations[0] ? 0.9 : 0.9) * 100,
      )}% bootstrap confidence band and observed annual maxima (Cunnane plotting positions).`;
    }
    if (name === "idf") {
      return "Intensity-duration-frequency curves: site-specific analysis (solid, with confidence band) compared with the ECCC published IDF (dashed). Log-log axes.";
    }
    return "L-moment ratio diagram: sample ratios per duration against theoretical distribution relationships (Hosking & Wallis, 1997).";
  };

  return body.figures.map((f) => ({
    name: f.name,
    png: Buffer.from(f.pngBase64, "base64"),
    caption: captionFor(f.name),
  }));
}

export async function assembleReportContext(
  projectId: string,
  pfaAnalysisId: string,
): Promise<ReportContext> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("project_not_found");

  const [pfaRow] = await db
    .select({ analysis: schema.analyses, result: schema.analysisResults })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .where(
      and(
        eq(schema.analyses.id, pfaAnalysisId),
        eq(schema.analyses.projectId, projectId),
        eq(schema.analyses.type, "pfa"),
      ),
    )
    .limit(1);
  if (!pfaRow) throw new Error("pfa_analysis_not_found");
  const pfa = pfaRow.result.results as unknown as PfaResponse;
  const pfaInputs = pfaRow.analysis.inputs as Record<string, unknown>;

  if (!pfaRow.analysis.stationId) throw new Error("provenance_incomplete: no station");
  const [station] = await db
    .select()
    .from(schema.stations)
    .where(eq(schema.stations.id, pfaRow.analysis.stationId))
    .limit(1);
  if (!station) throw new Error("provenance_incomplete: station missing");

  // Upstream QC analysis (holds the interval-correction settings).
  const qcAnalysisId = pfaInputs.qcAnalysisId as string | undefined;
  if (!qcAnalysisId) throw new Error("provenance_incomplete: no QC analysis link");
  const [qcJoined] = await db
    .select({ analysis: schema.analyses, result: schema.analysisResults })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .where(eq(schema.analyses.id, qcAnalysisId))
    .limit(1);
  if (!qcJoined) throw new Error("provenance_incomplete: QC analysis missing");
  const qcRow = qcJoined.analysis;
  const qcAms =
    ((qcJoined.result.results as Record<string, unknown>)
      .durations as ReportContext["qcAms"]) ?? [];

  // Upstream pulls.
  const pullIds = (pfaInputs.upstreamPullIds as string[] | undefined) ?? [];
  const pulls =
    pullIds.length > 0
      ? await db
          .select()
          .from(schema.dataPulls)
          .where(inArray(schema.dataPulls.id, pullIds))
      : [];
  if (pulls.length === 0) throw new Error("provenance_incomplete: no data pulls");

  const [dam] = await db
    .select()
    .from(schema.dams)
    .where(eq(schema.dams.projectId, projectId))
    .limit(1);
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.projectId, projectId))
    .limit(1);

  const published = station.province
    ? await getPublishedIdf(station.climateId, station.province).catch(() => null)
    : null;

  const seed = pfa.seed;
  const figures = await fetchFigures(pfa, published, station, seed);

  return {
    project,
    dam: dam
      ? { name: dam.name, owner: dam.owner, cdaCategory: dam.cdaConsequenceCategory }
      : null,
    site:
      site && site.latitude !== null && site.longitude !== null
        ? { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM }
        : null,
    station,
    pfaAnalysis: pfaRow.analysis,
    pfa,
    qcAnalysis: qcRow,
    qcInputs: qcRow.inputs as Record<string, unknown>,
    qcAms,
    pulls,
    published,
    figures,
    generatedAt: new Date(),
    appVersion: APP_VERSION,
    engineVersion: pfa.engineVersion,
    seed,
  };
}
