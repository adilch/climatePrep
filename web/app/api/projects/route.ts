import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { CreateProjectInput } from "@climateprep/core-ts";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { APP_VERSION } from "@/lib/version";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, session.user.id))
    .orderBy(desc(schema.projects.updatedAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateProjectInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      // App version stamped at creation — part of the provenance chain (spec §5.1).
      appVersionCreated: APP_VERSION,
    })
    .returning();

  return NextResponse.json({ project }, { status: 201 });
}
