import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import * as blob from "@/lib/storage/blob";
import { APP_VERSION } from "@/lib/version";
import { assembleReportContext } from "./context";
import { buildDocx, DEFAULT_SECTIONS, type ReportSections } from "./docx";
import { buildReportHtml } from "./html";
import { buildPdf } from "./pdf";
import { buildXlsx } from "./xlsx";
import type { ReportDocument } from "@/lib/db/schema";

/**
 * Report generation (spec K1–K6): one context assembly → any subset of
 * formats. Files land in Blob under exports/{projectId}/ (spec §5.4); each
 * gets a report_documents row stamped with app+engine versions.
 */

export type ReportFormat = "docx" | "pdf" | "xlsx";

export async function generateReports(
  args: {
    projectId: string;
    pfaAnalysisId: string;
    formats: ReportFormat[];
    sections?: Partial<ReportSections>;
  },
  userId: string,
): Promise<ReportDocument[]> {
  const sections: ReportSections = { ...DEFAULT_SECTIONS, ...args.sections };
  const ctx = await assembleReportContext(args.projectId, args.pfaAnalysisId);

  const stamp = ctx.generatedAt
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "")
    .replaceAll("-", "");
  const baseName = `${ctx.station.climateId}_pfa-idf_${stamp}`;

  const docs: ReportDocument[] = [];
  for (const format of args.formats) {
    let bytes: Buffer;
    if (format === "xlsx") bytes = await buildXlsx(ctx);
    else if (format === "docx") bytes = await buildDocx(ctx, sections);
    else bytes = await buildPdf(buildReportHtml(ctx, sections));

    const fileName = `${baseName}.${format}`;
    const blobRef = `exports/${args.projectId}/${fileName}`;
    await blob.put(blobRef, bytes);

    const [doc] = await db
      .insert(schema.reportDocuments)
      .values({
        projectId: args.projectId,
        analysisId: args.pfaAnalysisId,
        format,
        blobRef,
        fileName,
        byteSize: bytes.byteLength,
        sections: sections as unknown as Record<string, unknown>,
        generatedAt: ctx.generatedAt,
        appVersion: APP_VERSION,
        engineVersion: ctx.engineVersion,
        createdBy: userId,
      })
      .returning();
    docs.push(doc);
  }

  await db
    .update(schema.projects)
    .set({ status: "report_ready", updatedAt: new Date() })
    .where(eq(schema.projects.id, args.projectId));

  return docs;
}

export const CONTENT_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  model_forcing: "application/octet-stream",
};
