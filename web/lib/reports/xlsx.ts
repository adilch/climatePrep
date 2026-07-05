import ExcelJS from "exceljs";
import type { ReportContext } from "./context";
import { comparisonRows, DISCLAIMER, OGL_ATTRIBUTION } from "./text";

/**
 * Excel workbook (spec K2): Raw / Calcs / Results / Comparison / Provenance /
 * Attribution. Reviewers want the numbers — values are real numbers (not
 * strings), units live in the headers, and every sheet is traceable to the
 * chain in the Provenance sheet.
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F766E" },
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

export async function buildXlsx(ctx: ReportContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `climatePrep v${ctx.appVersion}`;
  wb.created = ctx.generatedAt;

  // ---------------------------------------------------------------- Raw
  const raw = wb.addWorksheet("Raw (AMS)");
  raw.columns = [
    { header: "Duration (h)", key: "dur", width: 12 },
    { header: "Year", key: "year", width: 8 },
    { header: "AMS raw (mm)", key: "raw", width: 14 },
    { header: "AMS corrected (mm)", key: "val", width: 18 },
    { header: "Correction factor (–)", key: "f", width: 18 },
    { header: "Year completeness (–)", key: "c", width: 19 },
    { header: "Return period, Cunnane (yr)", key: "rp", width: 22 },
  ];
  styleHeader(raw.getRow(1));
  for (const d of ctx.qcAms) {
    const pfaDur = ctx.pfa.durations.find(
      (x) => x.durationHours === d.durationHours,
    );
    const ppByYear = new Map(
      (pfaDur?.plottingPositions ?? []).map((p) => [p.year, p.returnPeriod]),
    );
    for (const p of d.ams) {
      raw.addRow({
        dur: d.durationHours,
        year: p.year,
        raw: p.valueRaw,
        val: p.value,
        f: d.correctionApplied ? d.correctionFactor : 1.0,
        c: p.completeness,
        rp: ppByYear.has(p.year)
          ? Number(ppByYear.get(p.year)!.toFixed(2))
          : null,
      });
    }
    for (const s of d.yearsSkipped) {
      raw.addRow({ dur: d.durationHours, year: s.year, raw: null, val: null, f: null, c: null, rp: null });
      raw.lastRow!.getCell("val").value = `skipped: ${s.reason}`;
    }
  }

  // -------------------------------------------------------------- Calcs
  const calcs = wb.addWorksheet("Calcs (fits)");
  calcs.columns = [
    { header: "Duration (h)", key: "dur", width: 12 },
    { header: "Distribution", key: "dist", width: 16 },
    { header: "Method", key: "method", width: 12 },
    { header: "Parameters", key: "params", width: 44 },
    { header: "AIC", key: "aic", width: 10 },
    { header: "BIC", key: "bic", width: 10 },
    { header: "KS", key: "ks", width: 10 },
    { header: "AD", key: "ad", width: 10 },
    { header: "PPCC", key: "ppcc", width: 10 },
    { header: "RMSE (mm)", key: "rmse", width: 11 },
    { header: "Best fit (AIC)", key: "best", width: 13 },
  ];
  styleHeader(calcs.getRow(1));
  for (const d of ctx.pfa.durations) {
    for (const f of d.fits) {
      calcs.addRow({
        dur: d.durationHours,
        dist: f.key.toUpperCase(),
        method: f.estimationMethod,
        params: f.fitError
          ? `FIT ERROR: ${f.fitError}`
          : Object.entries(f.parameters)
              .map(([k, v]) => `${k}=${v}`)
              .join("; "),
        aic: f.goodnessOfFit?.aic ?? null,
        bic: f.goodnessOfFit?.bic ?? null,
        ks: f.goodnessOfFit?.ksStat ?? null,
        ad: f.goodnessOfFit?.adStat ?? null,
        ppcc: f.goodnessOfFit?.ppcc ?? null,
        rmse: f.goodnessOfFit?.rmse ?? null,
        best: d.bestFit === f.key ? "YES" : "",
      });
    }
    // L-moment ratios per duration
    calcs.addRow({
      dur: d.durationHours,
      dist: "(sample L-moments)",
      params: `l1=${d.lmomentRatios.l1.toFixed(4)}; l2=${d.lmomentRatios.l2.toFixed(4)}; t=${d.lmomentRatios.t.toFixed(4)}; t3=${d.lmomentRatios.t3.toFixed(4)}; t4=${d.lmomentRatios.t4.toFixed(4)}`,
    });
  }

  // ------------------------------------------------------------ Results
  const results = wb.addWorksheet("Results (quantiles+IDF)");
  results.columns = [
    { header: "Duration (h)", key: "dur", width: 12 },
    { header: "Distribution", key: "dist", width: 14 },
    { header: "T (yr)", key: "t", width: 9 },
    { header: "AEP (–)", key: "aep", width: 10 },
    { header: "Depth (mm)", key: "depth", width: 12 },
    { header: "CI low (mm)", key: "lo", width: 12 },
    { header: "CI high (mm)", key: "hi", width: 12 },
    { header: "Intensity (mm/h)", key: "int", width: 15 },
  ];
  styleHeader(results.getRow(1));
  const idfDist = ctx.pfa.idf.distribution;
  for (const d of ctx.pfa.durations) {
    const fit = d.fits.find((f) => f.key === idfDist && !f.fitError);
    if (!fit) continue;
    for (const q of fit.quantiles) {
      results.addRow({
        dur: d.durationHours,
        dist: idfDist.toUpperCase(),
        t: q.returnPeriod,
        aep: q.aep,
        depth: q.value,
        lo: q.ciLower,
        hi: q.ciUpper,
        int: Number((q.value / d.durationHours).toFixed(4)),
      });
    }
  }

  // ---------------------------------------------------------- Comparison
  const compRows = comparisonRows(ctx);
  if (compRows.length > 0) {
    const comp = wb.addWorksheet("Comparison (vs ECCC)");
    comp.columns = [
      { header: "Duration (h)", key: "dur", width: 12 },
      { header: "T (yr)", key: "t", width: 9 },
      { header: "Site depth (mm)", key: "site", width: 15 },
      {
        header: `ECCC ${ctx.published!.version} depth (mm)`,
        key: "pub",
        width: 20,
      },
      { header: "Δ (%)", key: "d", width: 10 },
    ];
    styleHeader(comp.getRow(1));
    for (const r of compRows) {
      comp.addRow({
        dur: r.durationHours,
        t: r.returnPeriod,
        site: r.siteMm,
        pub: r.publishedMm,
        d: Number(r.deltaPct.toFixed(1)),
      });
    }
  }

  // ---------------------------------------------------------- Provenance
  const prov = wb.addWorksheet("Provenance");
  prov.columns = [
    { header: "Item", key: "k", width: 34 },
    { header: "Value", key: "v", width: 90 },
  ];
  styleHeader(prov.getRow(1));
  const add = (k: string, v: string | number | null | undefined) =>
    prov.addRow({ k, v: v ?? "—" });

  add("Project", ctx.project.name);
  if (ctx.dam) add("Dam / CDA class", `${ctx.dam.name} (${ctx.dam.cdaCategory ?? "unclassified"})`);
  if (ctx.site)
    add(
      "Site",
      `${ctx.site.latitude.toFixed(5)}, ${ctx.site.longitude.toFixed(5)}${ctx.site.elevationM != null ? ` @ ${ctx.site.elevationM} m` : ""}`,
    );
  add("Station", `${ctx.station.stationName} — Climate ID ${ctx.station.climateId}`);
  add("WMO / TC ID", `${ctx.station.wmoId ?? "—"} / ${ctx.station.tcId ?? "—"}`);
  for (const p of ctx.pulls) {
    add(
      `Data pull ${p.id.slice(0, 8)}`,
      `${p.collection} · ${p.periodStart ?? "full"}→${p.periodEnd ?? ""} · ` +
        `${p.rowCount ?? "?"} rows · requested ${p.requestedAt.toISOString()} · ${p.endpointUrl}`,
    );
  }
  add("QC analysis", `${ctx.qcAnalysis.name} (${ctx.qcAnalysis.id})`);
  add("QC input hash", ctx.qcAnalysis.inputHash);
  add("PFA analysis", `${ctx.pfaAnalysis.name} (${ctx.pfaAnalysis.id})`);
  add("PFA input hash", ctx.pfaAnalysis.inputHash);
  add("Bootstrap seed", ctx.seed);
  add("Engine version", ctx.engineVersion);
  add("App version", ctx.appVersion);
  add("Generated at", ctx.generatedAt.toISOString());
  if (ctx.published) {
    add(
      "ECCC published IDF",
      `${ctx.published.version} (${ctx.published.versionDate}) · ${ctx.published.method} · ${ctx.published.sourceUrl}`,
    );
  }

  // ---------------------------------------------------------- Attribution
  const attr = wb.addWorksheet("Attribution");
  attr.columns = [{ header: "Notices", key: "t", width: 120 }];
  styleHeader(attr.getRow(1));
  attr.addRow({ t: OGL_ATTRIBUTION });
  attr.addRow({ t: "" });
  attr.addRow({ t: DISCLAIMER });
  attr.getColumn(1).alignment = { wrapText: true, vertical: "top" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
