import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { runQcAggregate, runQcInfill, runQcTrend } from "@/lib/analyses/run-qc";

type Ctx = { params: Promise<{ id: string }> };

const QcInput = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("trend"),
    pullId: z.string().uuid(),
    seriesType: z.enum(["annual_max", "annual_total"]).default("annual_max"),
    alpha: z.number().gt(0).lt(1).default(0.05),
    seed: z.number().int().default(42),
  }),
  z.object({
    op: z.literal("aggregate"),
    pullId: z.string().uuid(),
    durationsHours: z.array(z.number().positive()).min(1).default([24, 48, 72]),
    applyCorrection: z.boolean().default(true),
    singleIntervalFactor: z.number().min(1).max(1.5).optional(),
    minYearCompleteness: z.number().min(0).max(1).default(0.8),
  }),
  z.object({
    op: z.literal("infill"),
    targetPullId: z.string().uuid(),
    neighbourPullIds: z.array(z.string().uuid()).min(1),
    method: z.enum(["normal_ratio", "idw", "regression"]),
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

/** POST /api/projects/:id/qc — run a QC operation via the engine + persist. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = QcInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const input = parsed.data;
    const out =
      input.op === "trend"
        ? await runQcTrend({ projectId: id, ...input }, session.user.id)
        : input.op === "aggregate"
          ? await runQcAggregate({ projectId: id, ...input }, session.user.id)
          : await runQcInfill({ projectId: id, ...input }, session.user.id);
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** GET /api/projects/:id/qc — QC analyses with their latest results. */
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
    })
    .from(schema.analyses)
    .leftJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .where(and(eq(schema.analyses.projectId, id), eq(schema.analyses.type, "qc")))
    .orderBy(schema.analyses.createdAt);

  return NextResponse.json({ analyses: rows });
}
