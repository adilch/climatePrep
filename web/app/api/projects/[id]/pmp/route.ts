import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { runPmpAnalysis } from "@/lib/analyses/run-pmp";

type Ctx = { params: Promise<{ id: string }> };

const PmpInput = z.object({
  qcAnalysisId: z.string().uuid(),
  durationHours: z.number().gt(0),
  areaKm2: z.number().gt(0).nullable().optional(),
  kmOverride: z.number().gt(0).nullable().optional(),
  applyOutlierAdjustment: z.boolean().default(true),
  applyLengthAdjustment: z.boolean().default(true),
  applyIntervalAdjustment: z.boolean().default(true),
});

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
  const parsed = PmpInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const out = await runPmpAnalysis({ projectId: id, ...parsed.data }, session.user.id);
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
    .where(and(eq(schema.analyses.projectId, id), eq(schema.analyses.type, "pmp")))
    .orderBy(desc(schema.analyses.createdAt));
  return NextResponse.json({ analyses: rows });
}
