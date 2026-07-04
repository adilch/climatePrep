import * as blob from "@/lib/storage/blob";
import type { DataPull } from "@/lib/db/schema";

/**
 * Series extraction from raw pull blobs. GeoMet daily rows may omit missing
 * days entirely, so series are placed on a full daily grid from the first to
 * the last observed date — absent days become nulls (they are the thing the
 * QC infilling exists to find).
 */

interface RawBlobPayload {
  provenance: Record<string, unknown>;
  rows: Record<string, unknown>[];
}

export async function loadPullRows(pull: DataPull): Promise<Record<string, unknown>[]> {
  if (!pull.blobRef) throw new Error(`pull ${pull.id} has no blob`);
  const raw = await blob.get(pull.blobRef);
  if (!raw) throw new Error(`blob ${pull.blobRef} missing`);
  const payload = JSON.parse(raw.toString("utf8")) as RawBlobPayload;
  return payload.rows;
}

/** Full daily grid of an element from climate-daily rows. */
export function dailyGrid(
  rows: Record<string, unknown>[],
  element = "TOTAL_PRECIPITATION",
): { dates: string[]; values: (number | null)[] } {
  const byDate = new Map<string, number | null>();
  for (const r of rows) {
    const d = String(r.LOCAL_DATE ?? "").slice(0, 10);
    if (!d) continue;
    const v = r[element];
    byDate.set(d, typeof v === "number" && Number.isFinite(v) ? v : null);
  }
  if (byDate.size === 0) return { dates: [], values: [] };

  const sorted = [...byDate.keys()].sort();
  const start = new Date(`${sorted[0]}T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);
  const dates: string[] = [];
  const values: (number | null)[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    dates.push(iso);
    values.push(byDate.get(iso) ?? null);
  }
  return { dates, values };
}

/**
 * Annual series (max or total) of a daily element, with per-year completeness.
 * Years below the completeness threshold are excluded and reported — a
 * half-observed year must not contribute a spurious "annual maximum".
 */
export function annualSeries(
  rows: Record<string, unknown>[],
  kind: "annual_max" | "annual_total",
  element = "TOTAL_PRECIPITATION",
  minCompleteness = 0.8,
): {
  years: number[];
  values: number[];
  excluded: { year: number; completeness: number }[];
} {
  const { dates, values } = dailyGrid(rows, element);
  const byYear = new Map<number, { present: number; expected: number; max: number; total: number }>();

  for (let i = 0; i < dates.length; i++) {
    const year = Number(dates[i].slice(0, 4));
    let acc = byYear.get(year);
    if (!acc) {
      acc = { present: 0, expected: isLeap(year) ? 366 : 365, max: -Infinity, total: 0 };
      byYear.set(year, acc);
    }
    const v = values[i];
    if (v !== null) {
      acc.present += 1;
      acc.total += v;
      if (v > acc.max) acc.max = v;
    }
  }

  const years: number[] = [];
  const out: number[] = [];
  const excluded: { year: number; completeness: number }[] = [];
  for (const [year, acc] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const completeness = acc.present / acc.expected;
    if (completeness < minCompleteness || acc.present === 0) {
      excluded.push({ year, completeness: Number(completeness.toFixed(3)) });
      continue;
    }
    years.push(year);
    out.push(kind === "annual_max" ? acc.max : Number(acc.total.toFixed(1)));
  }
  return { years, values: out, excluded };
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
