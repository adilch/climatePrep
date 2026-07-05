import { describe, expect, it } from "vitest";
import { hecCsv, swmmDat } from "@/lib/forcing/writers";
import type { HyetographOut } from "@climateprep/core-ts";

const H: HyetographOut = {
  pattern: "alt_block",
  dtHours: 1,
  durationHours: 3,
  depthsMm: [10.5, 30.25, 5.0],
  intensitiesMmHr: [10.5, 30.25, 5.0],
  cumulativeMm: [10.5, 40.75, 45.75],
  totalDepthMm: 45.75,
  peakIndex: 1,
  params: {},
  warnings: [],
};

describe("SWMM .dat writer (spec E3)", () => {
  const out = swmmDat(H, "GHOST RS", "2000-06-01T00:00:00");
  const dataLines = out.split("\n").filter((l) => l && !l.startsWith(";;"));

  it("one line per interval: station y m d h m value", () => {
    expect(dataLines).toHaveLength(3);
    expect(dataLines[0]).toBe("GHOST_RS 2000 06 01 00 00 10.5000");
    expect(dataLines[1]).toBe("GHOST_RS 2000 06 01 01 00 30.2500");
    expect(dataLines[2]).toBe("GHOST_RS 2000 06 01 02 00 5.0000");
  });

  it("station names have no spaces (SWMM token rule)", () => {
    expect(dataLines[0].split(" ")[0]).not.toContain(" ");
  });

  it("volumes sum to the storm total", () => {
    const sum = dataLines
      .map((l) => Number(l.split(" ").at(-1)))
      .reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(45.75, 4);
  });

  it("header documents format and interval", () => {
    expect(out).toContain("Format=VOLUME");
    expect(out).toContain("Interval=1:00");
  });
});

describe("HEC paste-ready CSV (spec E3)", () => {
  const out = hecCsv(H, "2000-06-01T00:00:00");
  const lines = out.trim().split("\n");

  it("has header + one row per interval", () => {
    expect(lines[1]).toBe("datetime,incremental_mm,cumulative_mm");
    expect(lines).toHaveLength(2 + 3);
  });

  it("cumulative column matches the hyetograph", () => {
    const last = lines.at(-1)!.split(",");
    expect(Number(last[2])).toBeCloseTo(45.75, 3);
    expect(last[0]).toBe("2000-06-01T02:00");
  });
});
