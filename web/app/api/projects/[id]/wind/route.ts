import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { runFreeboardAnalysis, runWindAnalysis } from "@/lib/analyses/run-wind";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("wind"),
    pullId: z.string().uuid(),
    source: z.enum(["hourly_wind", "daily_gust"]),
  }),
  z.object({
    op: z.literal("freeboard"),
    windTowardDeg: z.number().min(0).lt(360),
    uLandMs: z.number().gt(0).max(80),
    avgDepthM: z.number().gt(0),
    slopeVPerH: z.number().gt(0).max(2),
    gammaF: z.number().gt(0).max(1).default(0.55),
    waveMethod: z.enum(["smb", "spm84"]).default("smb"),
    runupMethod: z.enum(["taw2002", "hunt"]).default("taw2002"),
    allowancesM: z.record(z.string(), z.number().min(0)).default({}),
    windAnalysisId: z.string().uuid().nullable().optional(),
  }),
]);

async function ownsProject(projectId: string, userId: string) {
  const [p] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
    )
    .limit(1);
  return Boolean(p);
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const input = parsed.data;
    const out =
      input.op === "wind"
        ? await runWindAnalysis({ projectId: id, ...input }, session.user.id)
        : await runFreeboardAnalysis({ projectId: id, ...input }, session.user.id);
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const rows = await db
    .select({
      analysis: schema.analyses,
      result: schema.analysisResults,
      station: {
        stationName: schema.stations.stationName,
        climateId: schema.stations.climateId,
      },
    })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .leftJoin(schema.stations, eq(schema.analyses.stationId, schema.stations.id))
    .where(
      and(
        eq(schema.analyses.projectId, id),
        inArray(schema.analyses.type, ["wind", "freeboard"]),
      ),
    )
    .orderBy(desc(schema.analyses.createdAt));
  return NextResponse.json({ analyses: rows });
}
