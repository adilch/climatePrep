import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ReportContext } from "./context";
import {
  comparisonRows,
  DISCLAIMER,
  methodologyParagraphs,
  OGL_ATTRIBUTION,
} from "./text";

/**
 * DSR-ready report section (.docx, spec K1): methodology, tables, embedded
 * server-rendered figures with numbered captions, comparison vs ECCC
 * published IDF, and the provenance appendix + OGL attribution + disclaimer
 * (always included — spec K6).
 */

export interface ReportSections {
  methodology: boolean;
  amsTable: boolean;
  fitsTable: boolean;
  quantiles: boolean;
  figures: boolean;
  comparison: boolean;
}

export const DEFAULT_SECTIONS: ReportSections = {
  methodology: true,
  amsTable: true,
  fitsTable: true,
  quantiles: true,
  figures: true,
  comparison: true,
};

const MONO = "JetBrains Mono";

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true })],
  });
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

function body(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: 21 })],
  });
}

function caption(text: string) {
  return new Paragraph({
    spacing: { before: 60, after: 200 },
    children: [new TextRun({ text, italics: true, size: 18, color: "475569" })],
  });
}

function cell(text: string, opts: { bold?: boolean; mono?: boolean } = {}) {
  return new TableCell({
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            size: 17,
            font: opts.mono ? MONO : undefined,
          }),
        ],
      }),
    ],
  });
}

function table(header: string[], rows: string[][], monoCols: number[] = []) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "94a3b8" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "94a3b8" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" },
      insideVertical: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((t) => cell(t, { bold: true })),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((t, i) => cell(t, { mono: monoCols.includes(i) })),
          }),
      ),
    ],
  });
}

export async function buildDocx(
  ctx: ReportContext,
  sections: ReportSections = DEFAULT_SECTIONS,
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  let figureNo = 0;
  let tableNo = 0;

  // ------------------------------------------------------------ title
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Precipitation Frequency & IDF Analysis", bold: true }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `${ctx.project.name}${ctx.dam ? ` — ${ctx.dam.name}` : ""}`,
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [
        new TextRun({
          text:
            `Station ${ctx.station.stationName} (${ctx.station.climateId}) · ` +
            `generated ${ctx.generatedAt.toISOString().slice(0, 10)} · ` +
            `app v${ctx.appVersion} · engine v${ctx.engineVersion}`,
          size: 18,
          color: "64748b",
          font: MONO,
        }),
      ],
    }),
  );

  // ------------------------------------------------------- methodology
  if (sections.methodology) {
    children.push(h1("1. Methodology"));
    for (const p of methodologyParagraphs(ctx)) children.push(body(p));
  }

  // -------------------------------------------------------------- AMS
  if (sections.amsTable) {
    children.push(h1("2. Annual maximum series"));
    for (const d of ctx.qcAms) {
      tableNo += 1;
      children.push(h2(`${d.durationHours} h duration`));
      children.push(
        table(
          ["Year", "Raw (mm)", "Corrected (mm)", "Completeness"],
          d.ams.map((p) => [
            String(p.year),
            p.valueRaw.toFixed(1),
            p.value.toFixed(1),
            `${Math.round(p.completeness * 100)}%`,
          ]),
          [0, 1, 2, 3],
        ),
        caption(
          `Table ${tableNo}: AMS, ${d.durationHours} h duration` +
            (d.correctionApplied
              ? ` (fixed→true interval factor ${d.correctionFactor.toFixed(2)} applied).`
              : ` (no interval correction).`) +
            (d.yearsSkipped.length
              ? ` Years excluded: ${d.yearsSkipped.map((s) => s.year).join(", ")}.`
              : ""),
        ),
      );
    }
  }

  // -------------------------------------------------------------- fits
  if (sections.fitsTable) {
    children.push(h1("3. Distribution fits and goodness of fit"));
    for (const d of ctx.pfa.durations) {
      tableNo += 1;
      children.push(
        h2(`${d.durationHours} h duration (n = ${d.n})`),
        table(
          ["Distribution", "Parameters", "AIC", "KS", "AD", "PPCC"],
          d.fits.map((f) => [
            f.key.toUpperCase() + (d.bestFit === f.key ? " *" : ""),
            f.fitError
              ? `fit error: ${f.fitError}`
              : Object.entries(f.parameters)
                  .map(([k, v]) => `${k}=${v.toFixed(4)}`)
                  .join(", "),
            f.goodnessOfFit?.aic?.toFixed(1) ?? "—",
            f.goodnessOfFit?.ksStat?.toFixed(3) ?? "—",
            f.goodnessOfFit?.adStat?.toFixed(3) ?? "—",
            f.goodnessOfFit?.ppcc?.toFixed(4) ?? "—",
          ]),
          [1, 2, 3, 4, 5],
        ),
        caption(
          `Table ${tableNo}: fitted parameters and goodness of fit, ` +
            `${d.durationHours} h. * = lowest AIC.`,
        ),
      );
    }
  }

  // ---------------------------------------------------------- quantiles
  if (sections.quantiles) {
    const dist = ctx.pfa.idf.distribution;
    children.push(
      h1(`4. Design quantiles (${dist.toUpperCase()})`),
    );
    for (const d of ctx.pfa.durations) {
      const fit = d.fits.find((f) => f.key === dist && !f.fitError);
      if (!fit) continue;
      tableNo += 1;
      children.push(
        h2(`${d.durationHours} h duration`),
        table(
          ["T (yr)", "AEP", "Depth (mm)", "90% CI (mm)", "Intensity (mm/h)"],
          fit.quantiles.map((q) => [
            String(q.returnPeriod),
            String(q.aep),
            q.value.toFixed(1),
            q.ciLower !== null && q.ciUpper !== null
              ? `${q.ciLower.toFixed(1)} – ${q.ciUpper.toFixed(1)}`
              : "—",
            (q.value / d.durationHours).toFixed(2),
          ]),
          [0, 1, 2, 3, 4],
        ),
        caption(
          `Table ${tableNo}: ${dist.toUpperCase()} quantiles with bootstrap ` +
            `confidence intervals (seed ${ctx.seed}), ${d.durationHours} h.`,
        ),
      );
    }
  }

  // ------------------------------------------------------------ figures
  if (sections.figures) {
    children.push(h1("5. Figures"));
    for (const fig of ctx.figures) {
      figureNo += 1;
      children.push(
        new Paragraph({
          spacing: { before: 200 },
          children: [
            new ImageRun({
              type: "png",
              data: fig.png,
              transformation: { width: 620, height: 400 },
            }),
          ],
        }),
        caption(`Figure ${figureNo}: ${fig.caption}`),
      );
    }
  }

  // --------------------------------------------------------- comparison
  const compRows = comparisonRows(ctx);
  if (sections.comparison && compRows.length > 0) {
    tableNo += 1;
    children.push(
      h1("6. Comparison with ECCC published IDF"),
      body(
        `Shared duration/return-period points between the site-specific ` +
          `analysis and the ECCC published IDF ${ctx.published!.version} ` +
          `(${ctx.published!.method}; record ${ctx.published!.yearsRange ?? "n/a"}).`,
      ),
      table(
        ["Duration (h)", "T (yr)", "Site (mm)", `ECCC ${ctx.published!.version} (mm)`, "Δ (%)"],
        compRows.map((r) => [
          String(r.durationHours),
          String(r.returnPeriod),
          r.siteMm.toFixed(1),
          r.publishedMm.toFixed(1),
          `${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}`,
        ]),
        [0, 1, 2, 3, 4],
      ),
      caption(`Table ${tableNo}: site-specific vs published depths.`),
    );
  }

  // --------------------------------------------------- provenance appendix
  children.push(
    h1("Appendix A — Provenance"),
    body(
      "Every number in this document is traceable to the chain below " +
        "(spec: no result is exported without a complete source → method → " +
        "version chain).",
    ),
  );
  const provRows: string[][] = [
    ["Project", ctx.project.name],
    ...(ctx.dam
      ? [["Dam / CDA class", `${ctx.dam.name} (${ctx.dam.cdaCategory ?? "unclassified"})`]]
      : []),
    ...(ctx.site
      ? [[
          "Site",
          `${ctx.site.latitude.toFixed(5)}, ${ctx.site.longitude.toFixed(5)}` +
            (ctx.site.elevationM != null ? ` @ ${ctx.site.elevationM} m` : ""),
        ]]
      : []),
    ["Station", `${ctx.station.stationName} — Climate ID ${ctx.station.climateId}`],
    ["WMO / TC ID", `${ctx.station.wmoId ?? "—"} / ${ctx.station.tcId ?? "—"}`],
    ...ctx.pulls.map((p) => [
      `Data pull ${p.id.slice(0, 8)}`,
      `${p.collection} · ${p.periodStart ?? "full"}→${p.periodEnd ?? ""} · ` +
        `${p.rowCount ?? "?"} rows · ${p.requestedAt.toISOString()}`,
    ]),
    ["QC analysis / hash", `${ctx.qcAnalysis.id} / ${ctx.qcAnalysis.inputHash.slice(0, 24)}…`],
    ["PFA analysis / hash", `${ctx.pfaAnalysis.id} / ${ctx.pfaAnalysis.inputHash.slice(0, 24)}…`],
    ["Bootstrap seed", String(ctx.seed)],
    ["Engine / app version", `${ctx.engineVersion} / ${ctx.appVersion}`],
    ["Generated", ctx.generatedAt.toISOString()],
    ...(ctx.published
      ? [[
          "ECCC published IDF",
          `${ctx.published.version} (${ctx.published.versionDate}) · ${ctx.published.method}`,
        ]]
      : []),
  ];
  children.push(table(["Item", "Value"], provRows, [1]));

  // ------------------------------------------------ attribution/disclaimer
  children.push(
    h1("Licence and professional responsibility"),
    body(OGL_ATTRIBUTION),
    body(DISCLAIMER),
  );

  const doc = new Document({
    creator: `climatePrep v${ctx.appVersion}`,
    description: "Precipitation frequency & IDF analysis report section",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21 } },
      },
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: "94a3b8",
                  }),
                  new TextRun({
                    text: `   ·   climatePrep v${ctx.appVersion} · engine v${ctx.engineVersion} · OGL–Canada data`,
                    size: 16,
                    color: "94a3b8",
                    font: MONO,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
