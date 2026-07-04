import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";

type Ctx = { params: Promise<{ id: string }> };

const SiteInput = z.object({
  latitude: z.number().min(41).max(84),
  longitude: z.number().min(-141).max(-52),
  elevationM: z.number().nullable().optional(),
});

async function ownedProject(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
    )
    .limit(1);
  return project ?? null;
}

/** GET /api/projects/:id/site — the project's site pin (single site in M1). */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownedProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.projectId, id))
    .limit(1);
  return NextResponse.json({ site: site ?? null });
}

/** PUT /api/projects/:id/site — set/update the site pin. */
export async function PUT(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownedProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = SiteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.projectId, id))
    .limit(1);

  const values = {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    elevationM: parsed.data.elevationM ?? null,
    updatedAt: new Date(),
  };

  const [site] = existing
    ? await db
        .update(schema.sites)
        .set(values)
        .where(eq(schema.sites.id, existing.id))
        .returning()
    : await db
        .insert(schema.sites)
        .values({ projectId: id, ...values })
        .returning();

  return NextResponse.json({ site });
}
