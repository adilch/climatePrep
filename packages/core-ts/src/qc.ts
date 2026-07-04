import { z } from "zod";

/**
 * QC engine contract (spec §3.5 /api/engine/qc/*). These schemas MUST stay
 * 1:1 with engine/app/qc_models.py — the shared fixtures under
 * tests/contract/ are validated by BOTH sides in CI (spec §6.1).
 */

// --------------------------- trend/homogeneity -----------------------------

export const TrendRequest = z.object({
  series: z.array(z.number()).min(10),
  alpha: z.number().gt(0).lt(1).default(0.05),
  mcSamples: z.number().int().min(500).max(100_000).default(5000),
  seed: z.number().int().default(42),
});
export type TrendRequest = z.infer<typeof TrendRequest>;

export const MannKendallOut = z.object({
  trend: z.enum(["increasing", "decreasing", "no_trend"]),
  significant: z.boolean(),
  pValue: z.number(),
  z: z.number(),
  s: z.number(),
  varS: z.number(),
  tau: z.number(),
  senSlope: z.number(),
  senIntercept: z.number(),
});

export const ChangePointOut = z.object({
  homogeneous: z.boolean(),
  changePointIndex: z.number().int(),
  pValue: z.number(),
  statistic: z.number(),
  meanBefore: z.number(),
  meanAfter: z.number(),
});

export const TrendResponse = z.object({
  n: z.number().int(),
  alpha: z.number(),
  mannKendall: MannKendallOut,
  pettitt: ChangePointOut,
  snht: ChangePointOut,
  seed: z.number().int(),
  engineVersion: z.string(),
});
export type TrendResponse = z.infer<typeof TrendResponse>;

// ------------------------------ aggregation --------------------------------

export const AggregateRequest = z.object({
  timestamps: z.array(z.string()).min(1),
  values: z.array(z.number().nullable()),
  intervalHours: z.number().gt(0),
  durationsHours: z.array(z.number()).min(1),
  applyCorrection: z.boolean().default(true),
  correctionFactors: z.record(z.string(), z.number()).nullable().optional(),
  minYearCompleteness: z.number().min(0).max(1).default(0.8),
});
export type AggregateRequest = z.infer<typeof AggregateRequest>;

export const AmsPointOut = z.object({
  year: z.number().int(),
  valueRaw: z.number(),
  value: z.number(),
  windowEnd: z.string(),
  completeness: z.number(),
});
export type AmsPointOut = z.infer<typeof AmsPointOut>;

export const DurationSeriesOut = z.object({
  durationHours: z.number(),
  kIntervals: z.number().int(),
  correctionApplied: z.boolean(),
  correctionFactor: z.number(),
  ams: z.array(AmsPointOut),
  yearsSkipped: z.array(z.record(z.string(), z.unknown())),
});
export type DurationSeriesOut = z.infer<typeof DurationSeriesOut>;

export const AggregateResponse = z.object({
  durations: z.array(DurationSeriesOut),
  engineVersion: z.string(),
});
export type AggregateResponse = z.infer<typeof AggregateResponse>;

// -------------------------------- infilling --------------------------------

export const NeighbourIn = z.object({
  id: z.string(),
  name: z.string(),
  distanceKm: z.number().gt(0),
  values: z.array(z.number().nullable()),
});
export type NeighbourIn = z.infer<typeof NeighbourIn>;

export const InfillMethod = z.enum(["normal_ratio", "idw", "regression"]);
export type InfillMethod = z.infer<typeof InfillMethod>;

export const InfillRequest = z.object({
  dates: z.array(z.string()).min(1),
  target: z.array(z.number().nullable()),
  neighbours: z.array(NeighbourIn).min(1),
  method: InfillMethod,
  power: z.number().gt(0).default(2.0),
  minOverlap: z.number().int().min(3).default(30),
});
export type InfillRequest = z.infer<typeof InfillRequest>;

export const FilledPointOut = z.object({
  index: z.number().int(),
  date: z.string(),
  value: z.number(),
  method: z.string(),
  neighbours: z.array(z.record(z.string(), z.unknown())),
  params: z.record(z.string(), z.unknown()),
});

export const InfillResponse = z.object({
  filledValues: z.array(z.number().nullable()),
  filledPoints: z.array(FilledPointOut),
  unfillable: z.array(z.record(z.string(), z.unknown())),
  method: z.string(),
  stats: z.record(z.string(), z.unknown()),
  engineVersion: z.string(),
});
export type InfillResponse = z.infer<typeof InfillResponse>;
