import type { ReportContext } from "./context";
import type { ReportSections } from "./docx";
import {
  comparisonRows,
  DISCLAIMER,
  methodologyParagraphs,
  OGL_ATTRIBUTION,
} from "./text";

/**
 * Self-contained print-styled HTML — the PDF source (spec K1/§3.7: one
 * content model shared with the .docx; figures are the same server-rendered
 * PNGs, embedded base64). No external assets: renders identically offline.
 */

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function tableHtml(header: string[], rows: string[][]): string {
  return `<table>
    <thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody>
  </table>`;
}

export function buildReportHtml(
  ctx: ReportContext,
  sections: ReportSections,
): string {
  const parts: string[] = [];
  let figureNo = 0;
  let tableNo = 0;

  parts.push(`
    <header>
      <h1 class="title">Precipitation Frequency &amp; IDF Analysis</h1>
      <p class="subtitle">${esc(ctx.project.name)}${ctx.dam ? ` — ${esc(ctx.dam.name)}` : ""}</p>
      <p class="meta">Station ${esc(ctx.station.stationName)} (${esc(ctx.station.climateId)})
        · generated ${ctx.generatedAt.toISOString().slice(0, 10)}
        · app v${esc(ctx.appVersion)} · engine v${esc(ctx.engineVersion)}</p>
    </header>`);

  if (sections.methodology) {
    parts.push(`<h2>1. Methodology</h2>`);
    for (const p of methodologyParagraphs(ctx)) parts.push(`<p>${esc(p)}</p>`);
  }

  if (sections.amsTable) {
    parts.push(`<h2>2. Annual maximum series</h2>`);
    for (const d of ctx.qcAms) {
      tableNo += 1;
      parts.push(`<h3>${d.durationHours} h duration</h3>`);
      parts.push(
        tableHtml(
          ["Year", "Raw (mm)", "Corrected (mm)", "Completeness"],
          d.ams.map((p) => [
            String(p.year),
            p.valueRaw.toFixed(1),
            p.value.toFixed(1),
            `${Math.round(p.completeness * 100)}%`,
          ]),
        ),
        `<p class="caption">Table ${tableNo}: AMS, ${d.durationHours} h duration` +
          (d.correctionApplied
            ? ` (fixed→true interval factor ${d.correctionFactor.toFixed(2)} applied).`
            : ` (no interval correction).`) +
          (d.yearsSkipped.length
            ? ` Years excluded: ${d.yearsSkipped.map((s) => s.year).join(", ")}.`
            : "") +
          `</p>`,
      );
    }
  }

  if (sections.fitsTable) {
    parts.push(`<h2>3. Distribution fits and goodness of fit</h2>`);
    for (const d of ctx.pfa.durations) {
      tableNo += 1;
      parts.push(
        `<h3>${d.durationHours} h duration (n = ${d.n})</h3>`,
        tableHtml(
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
        ),
        `<p class="caption">Table ${tableNo}: fitted parameters and goodness of fit, ${d.durationHours} h. * = lowest AIC.</p>`,
      );
    }
  }

  if (sections.quantiles) {
    const dist = ctx.pfa.idf.distribution;
    parts.push(`<h2>4. Design quantiles (${dist.toUpperCase()})</h2>`);
    for (const d of ctx.pfa.durations) {
      const fit = d.fits.find((f) => f.key === dist && !f.fitError);
      if (!fit) continue;
      tableNo += 1;
      parts.push(
        `<h3>${d.durationHours} h duration</h3>`,
        tableHtml(
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
        ),
        `<p class="caption">Table ${tableNo}: ${dist.toUpperCase()} quantiles with bootstrap CIs (seed ${ctx.seed}), ${d.durationHours} h.</p>`,
      );
    }
  }

  if (sections.figures) {
    parts.push(`<h2>5. Figures</h2>`);
    for (const fig of ctx.figures) {
      figureNo += 1;
      parts.push(
        `<figure>
          <img src="data:image/png;base64,${fig.png.toString("base64")}" alt="${esc(fig.name)}" />
          <figcaption>Figure ${figureNo}: ${esc(fig.caption)}</figcaption>
        </figure>`,
      );
    }
  }

  const compRows = comparisonRows(ctx);
  if (sections.comparison && compRows.length > 0) {
    tableNo += 1;
    parts.push(
      `<h2>6. Comparison with ECCC published IDF</h2>`,
      `<p>Shared duration/return-period points between the site-specific analysis and the ECCC published IDF ${esc(ctx.published!.version)} (${esc(ctx.published!.method)}; record ${esc(ctx.published!.yearsRange ?? "n/a")}).</p>`,
      tableHtml(
        ["Duration (h)", "T (yr)", "Site (mm)", `ECCC ${ctx.published!.version} (mm)`, "Δ (%)"],
        compRows.map((r) => [
          String(r.durationHours),
          String(r.returnPeriod),
          r.siteMm.toFixed(1),
          r.publishedMm.toFixed(1),
          `${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}`,
        ]),
      ),
      `<p class="caption">Table ${tableNo}: site-specific vs published depths.</p>`,
    );
  }

  parts.push(`<h2 class="page-break">Appendix A — Provenance</h2>`);
  parts.push(
    `<p>Every number in this document is traceable to the chain below.</p>`,
    tableHtml(
      ["Item", "Value"],
      [
        ["Project", ctx.project.name],
        ...(ctx.dam
          ? [["Dam / CDA class", `${ctx.dam.name} (${ctx.dam.cdaCategory ?? "unclassified"})`]]
          : []),
        ["Station", `${ctx.station.stationName} — Climate ID ${ctx.station.climateId}`],
        ["WMO / TC ID", `${ctx.station.wmoId ?? "—"} / ${ctx.station.tcId ?? "—"}`],
        ...ctx.pulls.map((p) => [
          `Data pull ${p.id.slice(0, 8)}`,
          `${p.collection} · ${p.periodStart ?? "full"}→${p.periodEnd ?? ""} · ${p.rowCount ?? "?"} rows · ${p.requestedAt.toISOString()}`,
        ]),
        ["QC analysis / hash", `${ctx.qcAnalysis.id} / ${ctx.qcAnalysis.inputHash.slice(0, 24)}…`],
        ["PFA analysis / hash", `${ctx.pfaAnalysis.id} / ${ctx.pfaAnalysis.inputHash.slice(0, 24)}…`],
        ["Bootstrap seed", String(ctx.seed)],
        ["Engine / app version", `${ctx.engineVersion} / ${ctx.appVersion}`],
        ["Generated", ctx.generatedAt.toISOString()],
        ...(ctx.published
          ? [["ECCC published IDF", `${ctx.published.version} (${ctx.published.versionDate}) · ${ctx.published.method}`]]
          : []),
      ],
    ),
  );

  parts.push(
    `<h2>Licence and professional responsibility</h2>`,
    `<p class="notice">${esc(OGL_ATTRIBUTION)}</p>`,
    `<p class="notice"><strong>${esc(DISCLAIMER)}</strong></p>`,
  );

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(ctx.project.name)} — PFA/IDF report</title>
<style>
  :root { color-scheme: light; }
  body { font-family: 'Segoe UI', 'Inter', system-ui, sans-serif; color: #0f172a;
         font-size: 10.5pt; line-height: 1.5; margin: 0; }
  header { margin-bottom: 18pt; }
  .title { font-size: 19pt; margin: 0 0 4pt; }
  .subtitle { font-size: 12pt; margin: 0 0 4pt; color: #334155; }
  .meta, .caption { font-family: Consolas, monospace; font-size: 8pt; color: #64748b; }
  .caption { font-style: italic; margin: 4pt 0 14pt; }
  h2 { font-size: 13pt; margin: 18pt 0 8pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; }
  h3 { font-size: 11pt; margin: 12pt 0 6pt; }
  p { text-align: justify; margin: 0 0 8pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 8.5pt; }
  th { background: #0f766e; color: white; text-align: left; padding: 3pt 6pt; }
  td { padding: 2.5pt 6pt; border-bottom: 0.5pt solid #e2e8f0;
       font-family: Consolas, monospace; }
  td:first-child { font-family: inherit; }
  tr { page-break-inside: avoid; }
  figure { margin: 12pt 0; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 100%; height: auto; }
  figcaption { font-style: italic; font-size: 8pt; color: #64748b; margin-top: 4pt; }
  .page-break { page-break-before: always; }
  .notice { font-size: 9pt; color: #334155; }
</style></head>
<body>${parts.join("\n")}</body></html>`;
}
