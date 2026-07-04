import { unzipSync } from "fflate";
import * as blob from "@/lib/storage/blob";

/**
 * ECCC Engineering Climate Datasets — published IDF ingestion (spec A3, §5.5
 * eccc_idf_reference). Source verified 2026-07-04:
 *   collaboration.cmc.ec.gc.ca/cmc/climate/Engineer_Climate/IDF/
 * We use the v3.20 (2021-03-26) per-province archives — the newest v3.40
 * ships only as a single 665 MB bulk zip. Version is stamped into every
 * parsed record (provenance); published curves are Gumbel fits by method of
 * moments, which is why the site-specific IDF defaults to Gumbel (spec K5).
 */

const IDF_VERSION = "v3.20";
const IDF_DATE = "2021-03-26";
const BASE =
  "https://collaboration.cmc.ec.gc.ca/cmc/climate/Engineer_Climate/IDF/IDF_archive/idf_v-3.20_2021_3_26/IDF_Files_Fichiers";

const PROVINCE_ZIPS: Record<string, string> = {
  AB: `IDF_v-3.20_2021_03_26_AB.zip`,
  BC: `IDF_v-3.20_2021_03_26_BC.zip`,
  NB: `IDF_v-3.20_2021_03_26_NB.zip`,
  NL: `IDF_v-3.20_2021_03_26_NL.zip`,
  NT: `IDF_v-3.20_2021_03_26_NT.zip`,
  NU: `IDF_v-3.20_2021_03_26_NU.zip`,
  ON: `IDF_v-3.20_2021_03_26_ON.zip`,
  QC: `IDF_v-3.20_2021_03_26_QC.zip`,
  SK: `IDF_v-3.20_2021_03_26_SK.zip`,
  YT: `IDF_v-3.20_2021_03_26_YT.zip`,
  // MB/NS/PE stations ship in the "Additional" archive in v3.20.
  MB: `IDF_Additional_Additionnel_v-3.20.zip`,
  NS: `IDF_Additional_Additionnel_v-3.20.zip`,
  PE: `IDF_Additional_Additionnel_v-3.20.zip`,
};

/** Published IDF durations → hours (5 min … 24 h). */
export const PUBLISHED_DURATIONS: { label: string; hours: number }[] = [
  { label: "5 min", hours: 5 / 60 },
  { label: "10 min", hours: 10 / 60 },
  { label: "15 min", hours: 15 / 60 },
  { label: "30 min", hours: 30 / 60 },
  { label: "1 h", hours: 1 },
  { label: "2 h", hours: 2 },
  { label: "6 h", hours: 6 },
  { label: "12 h", hours: 12 },
  { label: "24 h", hours: 24 },
];

export const PUBLISHED_RETURN_PERIODS = [2, 5, 10, 25, 50, 100];

export interface PublishedIdf {
  climateId: string;
  stationName: string;
  province: string;
  version: string;
  versionDate: string;
  method: string;
  yearsRange: string | null;
  nYears: number | null;
  durations: { label: string; hours: number }[];
  returnPeriods: number[];
  /** depthsMm[durationIdx][rpIdx] from Table 2a; null where missing. */
  depthsMm: (number | null)[][];
  /** intensitiesMmHr[durationIdx][rpIdx] from Table 2b. */
  intensitiesMmHr: (number | null)[][];
  /** ci95MmHr[durationIdx][rpIdx] — the ± half-width from Table 2b. */
  ci95MmHr: (number | null)[][];
  sourceUrl: string;
  oglAttribution: true;
}

/**
 * Parse an ECCC v3.x IDF station .txt (latin-1). Extracts Table 2a
 * (return-period depths, mm) and Table 2b (rates mm/h with ±95% CI rows).
 */
export function parsePublishedIdfTxt(
  text: string,
  meta: { climateId: string; province: string; sourceUrl: string },
): PublishedIdf {
  const lines = text.split(/\r?\n/);

  // Header: " KANANASKIS    AB    3053600" — take name from the line that
  // ends with the climate id; method line contains "Gumbel".
  let stationName = "";
  let yearsRange: string | null = null;
  let nYears: number | null = null;
  let method = "Gumbel - Method of moments";
  for (const line of lines.slice(0, 30)) {
    const idLine = line.trim();
    if (idLine.endsWith(meta.climateId)) {
      stationName = idLine.replace(meta.climateId, "").trim().replace(/\s+[A-Z]{2}$/, "").trim();
    }
    const years = line.match(/Years.*?:\s*(\d{4})\s*-\s*(\d{4})\s*#\s*Years.*?:\s*(\d+)/);
    if (years) {
      yearsRange = `${years[1]}–${years[2]}`;
      nYears = Number(years[3]);
    }
    if (/Gumbel/.test(line)) method = line.trim().split("/")[0].trim();
  }

  const nD = PUBLISHED_DURATIONS.length;
  const nT = PUBLISHED_RETURN_PERIODS.length;
  const depths: (number | null)[][] = Array.from({ length: nD }, () =>
    new Array(nT).fill(null),
  );
  const rates: (number | null)[][] = Array.from({ length: nD }, () =>
    new Array(nT).fill(null),
  );
  const cis: (number | null)[][] = Array.from({ length: nD }, () =>
    new Array(nT).fill(null),
  );

  // Locate tables by their banner lines.
  const idx2a = lines.findIndex((l) => /Table 2a/.test(l));
  const idx2b = lines.findIndex((l) => /Table 2b/.test(l));
  const idx3 = lines.findIndex((l) => /Table 3/.test(l));

  const durPattern = PUBLISHED_DURATIONS.map((d) =>
    d.label.replace(" ", "\\s+"),
  );

  function durationIndex(line: string): number {
    for (let i = 0; i < nD; i++) {
      if (new RegExp(`^\\s*${durPattern[i]}\\b`).test(line)) return i;
    }
    return -1;
  }

  function parseRow(line: string, di: number, into: (number | null)[][]) {
    // Strip the duration label, then read the first nT numbers.
    const nums = line
      .replace(/^\s*\d+\s*(min|h)\b/i, "")
      .trim()
      .split(/\s+/)
      .map(Number);
    for (let t = 0; t < nT && t < nums.length; t++) {
      into[di][t] = Number.isFinite(nums[t]) ? nums[t] : null;
    }
  }

  if (idx2a !== -1) {
    for (const line of lines.slice(idx2a, idx2b === -1 ? undefined : idx2b)) {
      const di = durationIndex(line);
      if (di !== -1) parseRow(line, di, depths);
    }
  }

  if (idx2b !== -1) {
    let lastDi = -1;
    for (const line of lines.slice(idx2b, idx3 === -1 ? undefined : idx3)) {
      const di = durationIndex(line);
      if (di !== -1) {
        parseRow(line, di, rates);
        lastDi = di;
      } else if (lastDi !== -1 && /\+\/-/.test(line)) {
        const nums = line
          .replaceAll("+/-", " ")
          .trim()
          .split(/\s+/)
          .map(Number);
        for (let t = 0; t < nT && t < nums.length; t++) {
          cis[lastDi][t] = Number.isFinite(nums[t]) ? nums[t] : null;
        }
        lastDi = -1;
      }
    }
  }

  return {
    climateId: meta.climateId,
    stationName,
    province: meta.province,
    version: IDF_VERSION,
    versionDate: IDF_DATE,
    method,
    yearsRange,
    nYears,
    durations: PUBLISHED_DURATIONS,
    returnPeriods: PUBLISHED_RETURN_PERIODS,
    depthsMm: depths,
    intensitiesMmHr: rates,
    ci95MmHr: cis,
    sourceUrl: meta.sourceUrl,
    oglAttribution: true,
  };
}

/**
 * Fetch + cache the published IDF for a station. Downloads the province
 * archive at most once ever: all station .txt files inside are unpacked to
 * Blob (`eccc-idf/{version}/{province}/{climateId}.txt`) on first use.
 * Returns null when ECCC publishes no IDF for the station (most climate
 * stations have none — only ~600 tipping-bucket stations do).
 */
export async function getPublishedIdf(
  climateId: string,
  province: string,
): Promise<PublishedIdf | null> {
  const zipName = PROVINCE_ZIPS[province];
  if (!zipName) return null;
  const sourceUrl = `${BASE}/${zipName}`;

  const txtKey = `eccc-idf/${IDF_VERSION}/${province}/${climateId}.txt`;
  const markerKey = `eccc-idf/${IDF_VERSION}/${province}/.unpacked`;

  let txt = await blob.get(txtKey);
  if (!txt) {
    if (await blob.get(markerKey)) return null; // archive unpacked; station absent

    const res = await fetch(sourceUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`ECCC IDF archive ${res.status} for ${province}`);
    const zipped = new Uint8Array(await res.arrayBuffer());
    const entries = unzipSync(zipped, {
      filter: (f) => f.name.endsWith(".txt"),
    });

    for (const [path, data] of Object.entries(entries)) {
      // ..._305_AB_3053600_KANANASKIS.txt → climate id is the 4th-from-last
      // underscore-separated token group before the station name.
      const m = path.match(/_([A-Z]{2})_([0-9A-Z]{7})_[^/]*\.txt$/);
      if (!m) continue;
      await blob.put(`eccc-idf/${IDF_VERSION}/${m[1]}/${m[2]}.txt`, Buffer.from(data));
    }
    await blob.put(markerKey, `unpacked ${new Date().toISOString()}`);
    txt = await blob.get(txtKey);
    if (!txt) return null;
  }

  return parsePublishedIdfTxt(txt.toString("latin1"), {
    climateId,
    province,
    sourceUrl,
  });
}
