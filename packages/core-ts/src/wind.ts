import { z } from "zod";

/**
 * Wind / fetch-wave / freeboard engine contract (spec §3.5). 1:1 with
 * engine/app/wind_models.py (contract fixtures, spec §6.1).
 */

export const WindSeriesPoint = z.object({
  year: z.number().int(),
  value: z.number(),
});

export const WindRequest = z.object({
  series: z.array(WindSeriesPoint).min(5),
  label: z.string().default("annual max hourly wind"),
  returnPeriods: z.array(z.number().gt(1)).default([2, 10, 25, 50, 100, 200, 1000]),
  bootstrapN: z.number().int().min(0).max(10_000).default(1000),
  seed: z.number().int().default(42),
  roseSpeedsKmh: z.array(z.number().nullable()).nullable().optional(),
  roseDirectionsDeg: z.array(z.number().nullable()).nullable().optional(),
});
export type WindRequest = z.infer<typeof WindRequest>;

export const WindQuantileOut = z.object({
  returnPeriod: z.number(),
  speedKmh: z.number(),
  speedMs: z.number(),
  ciLowerKmh: z.number().nullable(),
  ciUpperKmh: z.number().nullable(),
});
export type WindQuantileOut = z.infer<typeof WindQuantileOut>;

export const WindResponse = z.object({
  label: z.string(),
  n: z.number().int(),
  gumbelParams: z.record(z.string(), z.number()),
  quantiles: z.array(WindQuantileOut),
  rose: z.record(z.string(), z.unknown()).nullable(),
  seed: z.number().int(),
  engineVersion: z.string(),
});
export type WindResponse = z.infer<typeof WindResponse>;

export const FetchWaveRequest = z.object({
  siteLat: z.number(),
  siteLon: z.number(),
  polygonLonLat: z.array(z.array(z.number()).length(2)).min(3),
  windTowardDeg: z.number().min(0).lt(360),
  uLandMs: z.number().gt(0),
  avgDepthM: z.number().gt(0).nullable().optional(),
  waveMethod: z.enum(["smb", "spm84"]).default("smb"),
  rlOverride: z.number().gt(0).nullable().optional(),
  directionalScan: z.boolean().default(false),
});
export type FetchWaveRequest = z.infer<typeof FetchWaveRequest>;

export const FetchWaveResponse = z.object({
  fetch: z.record(z.string(), z.unknown()),
  wave: z.record(z.string(), z.unknown()),
  uWaterMs: z.number(),
  rl: z.number(),
  scan: z.record(z.string(), z.unknown()).nullable(),
  engineVersion: z.string(),
});
export type FetchWaveResponse = z.infer<typeof FetchWaveResponse>;

export const FreeboardRequest = z.object({
  uLandMs: z.number().gt(0),
  fetchKm: z.number().gt(0),
  avgDepthM: z.number().gt(0),
  slopeVPerH: z.number().gt(0).max(2),
  gammaF: z.number().gt(0).max(1).default(0.55),
  waveMethod: z.enum(["smb", "spm84"]).default("smb"),
  runupMethod: z.enum(["taw2002", "hunt"]).default("taw2002"),
  rlOverride: z.number().gt(0).nullable().optional(),
  allowancesM: z.record(z.string(), z.number()).default({}),
});
export type FreeboardRequest = z.infer<typeof FreeboardRequest>;

export const FreeboardResponse = z.object({
  hsM: z.number(),
  tS: z.number(),
  runupM: z.number(),
  setupM: z.number(),
  allowancesM: z.record(z.string(), z.number()),
  totalFreeboardM: z.number(),
  inputs: z.record(z.string(), z.unknown()),
  engineVersion: z.string(),
});
export type FreeboardResponse = z.infer<typeof FreeboardResponse>;
