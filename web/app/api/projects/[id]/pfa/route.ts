import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { runPfaAnalysis } from "@/lib/analyses/run-pfa";

type Ctx = { params: Promise<{ id: string }> };

const Dist = z.enum(["gumbel", "gev", "glo", "pe3", "lp3"]);

const PfaInput = z.object({
  qcAnalysisId: z.string().uuid(),
  distributions: z.array(Dist).min(1).default(["gumbel", "gev", "glo", "pe3", "lp3"]),
  estimationMethod: z.enum(["lmoments", "mom", "mle"]).default("lmoments"),
  returnPeriods: z
    .array(z.number().gt(1))
    .default([2, 5, 10, 25, 50, 100, 200, 500, 1000, 10000]),
  bootstrapN: z.number().int().min(0).max(10000).default(2000),
  ciLevel: z.number().gt(0).lt(1).default(0.9),
  seed: z.number().int().default(42),
  idfDistribution: Dist.default("gumbel"),
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

/** POST /api/projects/:id/pfa — run PFA/IDF from a QC AMS analysis. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = PfaInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const out = await runPfaAnalysis(
      { projectId: id, ...parsed.data },
      session.user.id,
    );
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** GET /api/projects/:id/pfa — PFA analyses with latest results + station. */
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
        id: schema.stations.id,
        climateId: schema.stations.climateId,
        stationName: schema.stations.stationName,
        province: schema.stations.province,
      },
    })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .leftJoin(schema.stations, eq(schema.analyses.stationId, schema.stations.id))
    .where(
      and(eq(schema.analyses.projectId, id), eq(schema.analyses.type, "pfa")),
    )
    .orderBy(desc(schema.analyses.createdAt));

  return NextResponse.json({ analyses: rows });
}
