import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { generateReports } from "@/lib/reports/generate";

type Ctx = { params: Promise<{ id: string }> };

const GenerateInput = z.object({
  pfaAnalysisId: z.string().uuid(),
  formats: z.array(z.enum(["docx", "pdf", "xlsx"])).min(1),
  sections: z
    .object({
      methodology: z.boolean().optional(),
      amsTable: z.boolean().optional(),
      fitsTable: z.boolean().optional(),
      quantiles: z.boolean().optional(),
      figures: z.boolean().optional(),
      comparison: z.boolean().optional(),
    })
    .optional(),
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

/** POST /api/projects/:id/reports — generate deliverables. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = GenerateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const documents = await generateReports(
      { projectId: id, ...parsed.data },
      session.user.id,
    );
    return NextResponse.json({ documents }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** GET /api/projects/:id/reports — generated deliverables, newest first. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const documents = await db
    .select()
    .from(schema.reportDocuments)
    .where(eq(schema.reportDocuments.projectId, id))
    .orderBy(desc(schema.reportDocuments.generatedAt));

  return NextResponse.json({ documents });
}
