import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePublishedIdfTxt,
  PUBLISHED_DURATIONS,
  PUBLISHED_RETURN_PERIODS,
} from "@/lib/eccc/idf-published";

/**
 * Parser golden test against the real ECCC v3.20 KANANASKIS (3053600) file
 * (fixture contains OGL-Canada data; source: ECCC Engineering Climate
 * Datasets IDF v3.20, 2021-03-26). Expected values read by hand from the
 * file's Table 2a / 2b.
 */

const TXT = fs.readFileSync(
  path.resolve(__dirname, "fixtures/idf_v3.20_AB_3053600_KANANASKIS.txt"),
  "latin1",
);

const parsed = parsePublishedIdfTxt(TXT, {
  climateId: "3053600",
  province: "AB",
  sourceUrl: "test://fixture",
});

describe("parsePublishedIdfTxt (KANANASKIS v3.20 golden)", () => {
  it("parses header metadata", () => {
    expect(parsed.stationName).toBe("KANANASKIS");
    expect(parsed.yearsRange).toBe("1982–1998");
    expect(parsed.nYears).toBe(12);
    expect(parsed.method).toMatch(/Gumbel/);
    expect(parsed.version).toBe("v3.20");
  });

  it("parses Table 2a depths (hand-checked corners)", () => {
    const d5 = PUBLISHED_DURATIONS.findIndex((d) => d.label === "5 min");
    const d24 = PUBLISHED_DURATIONS.findIndex((d) => d.label === "24 h");
    const t2 = PUBLISHED_RETURN_PERIODS.indexOf(2);
    const t100 = PUBLISHED_RETURN_PERIODS.indexOf(100);
    expect(parsed.depthsMm[d5][t2]).toBe(2.7);
    expect(parsed.depthsMm[d5][t100]).toBe(8.4);
    expect(parsed.depthsMm[d24][t2]).toBe(42.4);
    expect(parsed.depthsMm[d24][t100]).toBe(114.6);
  });

  it("parses Table 2b intensities and ±95% CIs", () => {
    const d1h = PUBLISHED_DURATIONS.findIndex((d) => d.label === "1 h");
    const t100 = PUBLISHED_RETURN_PERIODS.indexOf(100);
    expect(parsed.intensitiesMmHr[d1h][t100]).toBe(34.1);
    expect(parsed.ci95MmHr[d1h][t100]).toBe(15.2);
    const d24 = PUBLISHED_DURATIONS.findIndex((d) => d.label === "24 h");
    expect(parsed.intensitiesMmHr[d24][PUBLISHED_RETURN_PERIODS.indexOf(2)]).toBe(1.8);
    expect(parsed.ci95MmHr[d24][PUBLISHED_RETURN_PERIODS.indexOf(2)]).toBe(0.4);
  });

  it("depth ≈ intensity × duration (internal consistency)", () => {
    const d2h = PUBLISHED_DURATIONS.findIndex((d) => d.label === "2 h");
    const t10 = PUBLISHED_RETURN_PERIODS.indexOf(10);
    const depth = parsed.depthsMm[d2h][t10]!;
    const rate = parsed.intensitiesMmHr[d2h][t10]!;
    expect(rate * 2).toBeCloseTo(depth, 0);
  });

  it("all 9 durations × 6 return periods populated", () => {
    for (const row of parsed.depthsMm) {
      for (const v of row) expect(v).not.toBeNull();
    }
  });
});
