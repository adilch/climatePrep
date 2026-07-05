import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { hecCsv, swmmDat } from "@/lib/forcing/writers";
import type { HyetographOut } from "@climateprep/core-ts";

type Ctx = { params: Promise<{ id: string; analysisId: string }> };

/**
 * GET /api/projects/:id/storms/:analysisId/forcing?format=swmm|hec
 * Model-forcing export (spec E3) generated from the stored hyetograph.
 */
export async function GET(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, analysisId } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") ?? "swmm";

  const [row] = await db
    .select({
      analysis: schema.analyses,
      result: schema.analysisResults,
      project: schema.projects,
      station: { climateId: schema.stations.climateId },
    })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .innerJoin(schema.projects, eq(schema.analyses.projectId, schema.projects.id))
    .leftJoin(schema.stations, eq(schema.analyses.stationId, schema.stations.id))
    .where(
      and(
        eq(schema.analyses.id, analysisId),
        eq(schema.analyses.projectId, id),
        eq(schema.analyses.type, "design_storm"),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const hyeto = (row.result.results as { hyetograph: HyetographOut }).hyetograph;
  const station = row.station?.climateId ?? "STORM";

  const body =
    format === "hec" ? hecCsv(hyeto) : swmmDat(hyeto, station);
  const ext = format === "hec" ? "csv" : "dat";
  const name = `${station}_${hyeto.pattern}_${hyeto.durationHours}h.${ext}`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
