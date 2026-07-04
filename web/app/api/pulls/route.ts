import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { runPull } from "@/lib/pulls/run-pull";

const PullInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
  stationId: z.string().uuid(),
  collection: z.enum([
    "daily",
    "hourly",
    "monthly",
    "normals",
    "ahccdAnnual",
    "ahccdMonthly",
  ]),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** GET /api/pulls?projectId= — provenance-stamped pull history (spec A5). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const pulls = await db
    .select({
      pull: schema.dataPulls,
      station: {
        climateId: schema.stations.climateId,
        stationName: schema.stations.stationName,
      },
    })
    .from(schema.dataPulls)
    .innerJoin(
      schema.stations,
      eq(schema.dataPulls.stationId, schema.stations.id),
    )
    .where(eq(schema.dataPulls.projectId, projectId))
    .orderBy(desc(schema.dataPulls.requestedAt));

  return NextResponse.json({ pulls });
}

/** POST /api/pulls — execute a pull with full provenance capture. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = PullInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await runPull(parsed.data, session.user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "station_not_found" ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
