import { z } from "zod";

/**
 * PMP engine contract (spec §3.5 /api/engine/pmp). 1:1 with
 * engine/app/pmp_models.py (contract fixtures, spec §6.1).
 */

export const PmpRequest = z.object({
  series: z.array(z.number()).min(10),
  durationHours: z.number().gt(0),
  nObsUnits: z.number().int().min(1).default(1),
  areaKm2: z.number().gt(0).nullable().optional(),
  kmOverride: z.number().gt(0).nullable().optional(),
  fig42Override: z.number().gt(0).nullable().optional(),
  fig43Override: z.number().gt(0).nullable().optional(),
  fig44MeanOverride: z.number().gt(0).nullable().optional(),
  fig44SdOverride: z.number().gt(0).nullable().optional(),
  intervalFactorOverride: z.number().gt(0).nullable().optional(),
  arfOverride: z.number().gt(0).max(1).nullable().optional(),
  applyOutlierAdjustment: z.boolean().default(true),
  applyLengthAdjustment: z.boolean().default(true),
  applyIntervalAdjustment: z.boolean().default(true),
  dadAreasKm2: z.array(z.number().gt(0)).nullable().optional(),
});
export type PmpRequest = z.infer<typeof PmpRequest>;

export const PmpStepOut = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  source: z.string(),
  note: z.string(),
});
export type PmpStepOut = z.infer<typeof PmpStepOut>;

export const DadRowOut = z.object({
  areaKm2: z.number(),
  depthsMm: z.record(z.string(), z.number()),
});

export const PmpResponse = z.object({
  durationHours: z.number(),
  n: z.number().int(),
  meanMm: z.number(),
  sdMm: z.number(),
  meanExclMaxMm: z.number(),
  sdExclMaxMm: z.number(),
  adjustedMeanMm: z.number(),
  adjustedSdMm: z.number(),
  km: z.number(),
  pmpPointMm: z.number(),
  pmpTrueIntervalMm: z.number(),
  pmpArealMm: z.number().nullable(),
  areaKm2: z.number().nullable(),
  maxObservedMm: z.number(),
  steps: z.array(PmpStepOut),
  dad: z.array(DadRowOut).nullable(),
  digitizationNotice: z.string(),
  engineVersion: z.string(),
});
export type PmpResponse = z.infer<typeof PmpResponse>;
