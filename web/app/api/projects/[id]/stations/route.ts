import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";

type Ctx = { params: Promise<{ id: string }> };

const AddStationInput = z.object({
  stationId: z.string().uuid(),
  role: z.enum(["primary", "supporting", "wind", "comparison"]).default("primary"),
  distanceKm: z.number().nullable().optional(),
  elevationDiffM: z.number().nullable().optional(),
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

/** GET /api/projects/:id/stations — selected stations with catalog metadata. */
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
      projectStation: schema.projectStations,
      station: schema.stations,
    })
    .from(schema.projectStations)
    .innerJoin(
      schema.stations,
      eq(schema.projectStations.stationId, schema.stations.id),
    )
    .where(eq(schema.projectStations.projectId, id));

  return NextResponse.json({ stations: rows });
}

/** POST /api/projects/:id/stations — attach a station to the project. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = AddStationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(schema.projectStations)
    .values({
      projectId: id,
      stationId: parsed.data.stationId,
      role: parsed.data.role,
      distanceKm: parsed.data.distanceKm ?? null,
      elevationDiffM: parsed.data.elevationDiffM ?? null,
    })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json({ projectStation: row ?? null }, { status: 201 });
}

/** DELETE /api/projects/:id/stations?stationId= — detach a station. */
export async function DELETE(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await ownsProject(id, session.user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const stationId = new URL(req.url).searchParams.get("stationId");
  if (!stationId) {
    return NextResponse.json({ error: "stationId required" }, { status: 400 });
  }
  await db
    .delete(schema.projectStations)
    .where(
      and(
        eq(schema.projectStations.projectId, id),
        eq(schema.projectStations.stationId, stationId),
      ),
    );
  return NextResponse.json({ ok: true });
}
