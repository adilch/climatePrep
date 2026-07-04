import { describe, expect, it } from "vitest";
import {
  ecccCacheKey,
  paramsHash,
  stableStringify,
} from "@/lib/eccc/cache-key";
import { stationFeatureToRow } from "@/lib/stations/catalog";
import type { StationProps, GeoJsonFeature } from "@/lib/eccc/types";

describe("cache keys (spec §5.3)", () => {
  it("is deterministic regardless of key order", () => {
    const a = paramsHash({ datetime: "1990/2000", filters: { X: 1 } });
    const b = paramsHash({ filters: { X: 1 }, datetime: "1990/2000" });
    expect(a).toBe(b);
  });

  it("differs when params differ", () => {
    expect(paramsHash({ a: 1 })).not.toBe(paramsHash({ a: 2 }));
  });

  it("drops undefined values (same key with/without)", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(
      stableStringify({ a: 1 }),
    );
  });

  it("builds the spec key shape", () => {
    const key = ecccCacheKey({
      source: "msc_geomet",
      collection: "climate-daily",
      climateId: "3031093",
      period: "1990-01-01/2000-12-31",
      params: { x: 1 },
    });
    expect(key).toMatch(
      /^eccc:msc_geomet:climate-daily:3031093:1990-01-01_2000-12-31:[0-9a-f]{16}$/,
    );
  });
});

describe("stationFeatureToRow (verified GeoMet schema)", () => {
  const feature: GeoJsonFeature<StationProps> = {
    type: "Feature",
    // Real DAYSLAND sample from the live probe (2026-07-04): the properties'
    // LATITUDE/LONGITUDE are scaled ints — the geometry is authoritative.
    geometry: { type: "Point", coordinates: [-112.2833, 52.8667] },
    properties: {
      STN_ID: 1795,
      STATION_NAME: "DAYSLAND",
      PROV_STATE_TERR_CODE: "AB",
      ELEVATION: "688.80",
      CLIMATE_IDENTIFIER: "301AR54",
      TC_IDENTIFIER: null,
      WMO_IDENTIFIER: null,
      FIRST_DATE: "1908-01-01 00:00:00",
      LAST_DATE: "1922-12-01 00:00:00",
      HLY_FIRST_DATE: null,
      HLY_LAST_DATE: null,
      DLY_FIRST_DATE: "1908-02-01 00:00:00",
      DLY_LAST_DATE: "1922-04-30 00:00:00",
      MLY_FIRST_DATE: "1908-01-01 00:00:00",
      MLY_LAST_DATE: "1922-12-01 00:00:00",
      HAS_MONTHLY_SUMMARY: "Y",
      HAS_NORMALS_DATA: "N",
      HAS_HOURLY_DATA: "N",
    },
  };

  it("maps geometry coordinates, not the scaled properties", () => {
    const row = stationFeatureToRow(feature)!;
    expect(row.latitude).toBeCloseTo(52.8667, 4);
    expect(row.longitude).toBeCloseTo(-112.2833, 4);
  });

  it("parses elevation and record span", () => {
    const row = stationFeatureToRow(feature)!;
    expect(row.elevationM).toBeCloseTo(688.8, 2);
    expect(row.firstYear).toBe(1908);
    expect(row.lastYear).toBe(1922);
    expect(row.recordLengthYears).toBe(15);
  });

  it("captures per-collection availability", () => {
    const row = stationFeatureToRow(feature)!;
    const avail = row.availableCollections as Record<string, unknown>;
    expect(avail.daily).toEqual({ first: "1908-02-01", last: "1922-04-30" });
    expect(avail.hourly).toBeNull();
    expect(avail.hasNormals).toBe(false);
  });

  it("rejects features without geometry", () => {
    expect(stationFeatureToRow({ ...feature, geometry: null })).toBeNull();
  });
});
