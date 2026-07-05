import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import * as blob from "@/lib/storage/blob";
import { CONTENT_TYPES } from "@/lib/reports/generate";

type Ctx = { params: Promise<{ id: string; docId: string }> };

/** GET /api/projects/:id/reports/:docId/download — stream the deliverable. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, docId } = await ctx.params;

  const [row] = await db
    .select({ doc: schema.reportDocuments, project: schema.projects })
    .from(schema.reportDocuments)
    .innerJoin(
      schema.projects,
      eq(schema.reportDocuments.projectId, schema.projects.id),
    )
    .where(
      and(
        eq(schema.reportDocuments.id, docId),
        eq(schema.reportDocuments.projectId, id),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = await blob.get(row.doc.blobRef);
  if (!bytes) {
    return NextResponse.json({ error: "blob_missing" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[row.doc.format] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.doc.fileName}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
