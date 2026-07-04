import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANK_PARAMS,
  haversineKm,
  rankStation,
} from "@/lib/stations/rank";

describe("haversineKm", () => {
  it("Calgary → Edmonton is ~281 km great-circle", () => {
    // Calgary (51.0447, -114.0719) → Edmonton (53.5461, -113.4938).
    // ΔLat 2.5014° ≈ 278 km; with the small Δlon the great-circle ≈ 281 km.
    const d = haversineKm(51.0447, -114.0719, 53.5461, -113.4938);
    expect(d).toBeGreaterThan(278);
    expect(d).toBeLessThan(284);
  });

  it("zero distance for identical points", () => {
    expect(haversineKm(51, -114, 51, -114)).toBe(0);
  });
});

describe("rankStation — foothills golden example", () => {
  // Site: dam in the Elbow valley foothills SW of Calgary (~1400 m).
  const site = { latitude: 50.95, longitude: -114.57, elevationM: 1400 };

  // Synthetic but realistic candidates:
  const valleyGauge = {
    // very close but 500 m lower and a short record
    latitude: 50.98,
    longitude: -114.5,
    elevationM: 900,
    recordLengthYears: 8,
  };
  const benchStation = {
    // ~18 km away, similar elevation, long record — the defensible pick
    latitude: 50.8,
    longitude: -114.45,
    elevationM: 1340,
    recordLengthYears: 55,
  };
  const cityAirport = {
    // ~45 km away, 350 m lower, very long record
    latitude: 51.1247,
    longitude: -114.0078,
    elevationM: 1084,
    recordLengthYears: 90,
  };

  it("prefers the similar-elevation long-record bench station", () => {
    const rBench = rankStation(site, benchStation);
    const rValley = rankStation(site, valleyGauge);
    const rCity = rankStation(site, cityAirport);

    expect(rBench.score).toBeGreaterThan(rValley.score);
    expect(rBench.score).toBeGreaterThan(rCity.score);
  });

  it("computes components correctly for the bench station", () => {
    const r = rankStation(site, benchStation);
    expect(r.distanceKm).toBeGreaterThan(15);
    expect(r.distanceKm).toBeLessThan(22);
    expect(r.elevationDiffM).toBe(-60);
    expect(r.recordScore).toBeCloseTo(55 / 60, 5);
    // score ∈ (0, 1] and reproducible
    const again = rankStation(site, benchStation);
    expect(again.score).toBe(r.score);
  });

  it("does not penalize unknown elevation (flags instead)", () => {
    const unknownElev = { ...benchStation, elevationM: null };
    const r = rankStation(site, unknownElev);
    expect(r.elevationDiffM).toBeNull();
    expect(r.elevScore).toBe(1);
  });

  it("weights sum to 1 in the defaults", () => {
    const { distance, record, elevation } = DEFAULT_RANK_PARAMS.weights;
    expect(distance + record + elevation).toBeCloseTo(1, 10);
  });
});
