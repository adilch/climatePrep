import type { HyetographOut } from "@climateprep/core-ts";

/**
 * Model-forcing writers (spec E3 — forcing only, no routing).
 *
 * - SWMM: native rain-gage timeseries file (.dat) — loads directly via a
 *   RainGage with FILE source (station id + INTENSITY or VOLUME format).
 * - HEC-HMS / HEC-RAS: paste-ready CSV (date-time + incremental depth) for
 *   a Precipitation Gage / Specified Hyetograph table. Native DSS export is
 *   a Phase-3 item (binary DSS needs its own tooling) — documented.
 */

const DEFAULT_START = "2000-01-01T00:00:00";

function timeSteps(h: HyetographOut, startIso: string): Date[] {
  const start = new Date(`${startIso}Z`);
  return h.depthsMm.map(
    (_, k) => new Date(start.getTime() + k * h.dtHours * 3_600_000),
  );
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * SWMM rain-gage file: one line per interval —
 *   <station> <year> <month> <day> <hour> <minute> <value>
 * Written as rainfall VOLUME (mm per interval); configure the SWMM gage as
 * Format=VOLUME, Interval=dt.
 */
export function swmmDat(
  h: HyetographOut,
  station: string,
  startIso: string = DEFAULT_START,
): string {
  const clean = station.replaceAll(/\s+/g, "_").slice(0, 16);
  const lines = [
    `;; climatePrep design storm — pattern ${h.pattern}, dt ${h.dtHours} h, total ${h.totalDepthMm} mm`,
    `;; SWMM RainGage: Format=VOLUME  Interval=${h.dtHours}:00  (values in mm per interval)`,
    `;; OGL-Canada source data — reviewed engineer responsible for application`,
  ];
  for (const [k, t] of timeSteps(h, startIso).entries()) {
    lines.push(
      `${clean} ${t.getUTCFullYear()} ${p2(t.getUTCMonth() + 1)} ${p2(t.getUTCDate())} ` +
        `${p2(t.getUTCHours())} ${p2(t.getUTCMinutes())} ${h.depthsMm[k].toFixed(4)}`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * HEC-HMS/RAS paste-ready CSV: ISO date-time, incremental depth (mm),
 * cumulative depth (mm). Paste into a Precipitation Gage (HMS) or
 * Specified Hyetograph table (RAS unsteady/precip boundary).
 */
export function hecCsv(h: HyetographOut, startIso: string = DEFAULT_START): string {
  const lines = [
    `# climatePrep design storm — pattern ${h.pattern}, dt ${h.dtHours} h, total ${h.totalDepthMm} mm`,
    `datetime,incremental_mm,cumulative_mm`,
  ];
  const steps = timeSteps(h, startIso);
  for (let k = 0; k < steps.length; k++) {
    lines.push(
      `${steps[k].toISOString().slice(0, 16)},${h.depthsMm[k].toFixed(4)},${h.cumulativeMm[k].toFixed(3)}`,
    );
  }
  return lines.join("\n") + "\n";
}
