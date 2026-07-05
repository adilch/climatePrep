import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { runStormAnalysis } from "@/lib/analyses/run-pmp";

type Ctx = { params: Promise<{ id: string }> };

const StormInput = z.object({
  pattern: z.enum(["chicago", "alt_block", "scs_type2", "pmp"]),
  dtHours: z.number().gt(0).max(6).default(1),
  durationHours: z.number().gt(0).max(96).default(24),
  peakRatio: z.number().min(0.05).max(0.95).default(0.375),
  sourceAnalysisId: z.string().uuid().nullable().optional(),
  returnPeriod: z.number().gt(1).nullable().optional(),
  totalDepthMm: z.number().gt(0).nullable().optional(),
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
  const parsed = StormInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const out = await runStormAnalysis({ projectId: id, ...parsed.data }, session.user.id);
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
    .select({ analysis: schema.analyses, result: schema.analysisResults })
    .from(schema.analyses)
    .innerJoin(
      schema.analysisResults,
      eq(schema.analysisResults.analysisId, schema.analyses.id),
    )
    .where(
      and(
        eq(schema.analyses.projectId, id),
        eq(schema.analyses.type, "design_storm"),
      ),
    )
    .orderBy(desc(schema.analyses.createdAt));
  return NextResponse.json({ analyses: rows });
}
