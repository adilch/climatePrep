import { z } from "zod";

/**
 * PFA engine contract (spec §3.5 /api/engine/pfa). MUST stay 1:1 with
 * engine/app/pfa_models.py (shared fixtures in tests/contract/, spec §6.1).
 */

export const DistKey = z.enum(["gumbel", "gev", "glo", "pe3", "lp3"]);
export type DistKey = z.infer<typeof DistKey>;

export const SeriesPoint = z.object({ year: z.number().int(), value: z.number() });

export const DurationSeriesIn = z.object({
  durationHours: z.number().gt(0),
  series: z.array(SeriesPoint).min(5),
});

export const BootstrapConfig = z.object({
  n: z.number().int().min(0).max(10_000).default(2000),
  ci: z.number().gt(0).lt(1).default(0.9),
  seed: z.number().int().default(42),
});

export const PfaRequest = z.object({
  durations: z.array(DurationSeriesIn).min(1),
  distributions: z.array(DistKey).default(["gumbel", "gev", "glo", "pe3", "lp3"]),
  estimationMethod: z.enum(["lmoments", "mom", "mle"]).default("lmoments"),
  plottingPosition: z.enum(["cunnane", "weibull", "gringorten"]).default("cunnane"),
  returnPeriods: z
    .array(z.number().gt(1))
    .default([2, 5, 10, 25, 50, 100, 200, 500, 1000, 10000]),
  bootstrap: BootstrapConfig.default({ n: 2000, ci: 0.9, seed: 42 }),
  idfDistribution: DistKey.default("gumbel"),
});
export type PfaRequest = z.infer<typeof PfaRequest>;

export const QuantileOut = z.object({
  returnPeriod: z.number(),
  aep: z.number(),
  value: z.number(),
  ciLower: z.number().nullable(),
  ciUpper: z.number().nullable(),
});
export type QuantileOut = z.infer<typeof QuantileOut>;

// All GOF fields nullable: a statistic can be undefined for a valid fit
// (e.g. PE3 log-likelihood −inf → AIC/BIC null on the wire).
export const GofOut = z.object({
  ksStat: z.number().nullable(),
  ksPvalue: z.number().nullable(),
  adStat: z.number().nullable(),
  ppcc: z.number().nullable(),
  aic: z.number().nullable(),
  bic: z.number().nullable(),
  rmse: z.number().nullable(),
});

export const DistFitOut = z.object({
  key: z.string(),
  label: z.string(),
  estimationMethod: z.string(),
  parameters: z.record(z.string(), z.number()),
  quantiles: z.array(QuantileOut),
  curve: z.array(z.tuple([z.number(), z.number()])),
  goodnessOfFit: GofOut.nullable(),
  fitError: z.string().nullable(),
});
export type DistFitOut = z.infer<typeof DistFitOut>;

export const PlottingPointOut = z.object({
  year: z.number().int(),
  value: z.number(),
  exceedanceProb: z.number(),
  returnPeriod: z.number(),
});

export const LmomentRatiosOut = z.object({
  l1: z.number(),
  l2: z.number(),
  t: z.number(),
  t3: z.number(),
  t4: z.number(),
});

export const DurationFitOut = z.object({
  durationHours: z.number(),
  n: z.number().int(),
  bestFit: z.string().nullable(),
  lmomentRatios: LmomentRatiosOut,
  plottingPositions: z.array(PlottingPointOut),
  fits: z.array(DistFitOut),
});
export type DurationFitOut = z.infer<typeof DurationFitOut>;

export const IdfCellOut = z.object({
  intensity: z.number(),
  depth: z.number(),
  ciLow: z.number().nullable(),
  ciHigh: z.number().nullable(),
});
export type IdfCellOut = z.infer<typeof IdfCellOut>;

export const IdfOut = z.object({
  distribution: z.string(),
  durationsHours: z.array(z.number()),
  returnPeriods: z.array(z.number()),
  cells: z.array(z.array(IdfCellOut.nullable())),
});
export type IdfOut = z.infer<typeof IdfOut>;

export const PfaResponse = z.object({
  durations: z.array(DurationFitOut),
  idf: IdfOut,
  seed: z.number().int(),
  engineVersion: z.string(),
});
export type PfaResponse = z.infer<typeof PfaResponse>;

// --------------------------------- PDS --------------------------------------

export const PdsRequest = z.object({
  timestamps: z.array(z.string()).min(2),
  values: z.array(z.number().nullable()),
  threshold: z.number().nullable().optional(),
  eventsPerYear: z.number().gt(0).max(20).nullable().optional(),
  minSeparationIntervals: z.number().int().min(1).default(7),
});
export type PdsRequest = z.infer<typeof PdsRequest>;

export const PdsResponse = z.object({
  threshold: z.number(),
  minSeparationIntervals: z.number().int(),
  events: z.array(z.object({ timestamp: z.string(), value: z.number() })),
  eventsPerYear: z.number(),
  nYears: z.number(),
  engineVersion: z.string(),
});
export type PdsResponse = z.infer<typeof PdsResponse>;
