import { z } from "zod";

/**
 * Design-storm engine contract (spec §3.5 /api/engine/design-storm).
 * 1:1 with engine/app/pmp_models.py (contract fixtures, spec §6.1).
 */

export const StormPattern = z.enum(["chicago", "alt_block", "scs_type2", "pmp"]);
export type StormPattern = z.infer<typeof StormPattern>;

export const IdfPointsIn = z.object({
  durationsHours: z.array(z.number()).min(2),
  intensitiesMmHr: z.array(z.number()).nullable().optional(),
  depthsMm: z.array(z.number()).nullable().optional(),
});
export type IdfPointsIn = z.infer<typeof IdfPointsIn>;

export const DesignStormRequest = z.object({
  pattern: StormPattern,
  dtHours: z.number().gt(0).max(6),
  durationHours: z.number().gt(0).max(96).default(24),
  peakRatio: z.number().min(0.05).max(0.95).default(0.375),
  idf: IdfPointsIn.nullable().optional(),
  totalDepthMm: z.number().gt(0).nullable().optional(),
  pmp24hMm: z.number().gt(0).nullable().optional(),
});
export type DesignStormRequest = z.infer<typeof DesignStormRequest>;

export const HyetographOut = z.object({
  pattern: z.string(),
  dtHours: z.number(),
  durationHours: z.number(),
  depthsMm: z.array(z.number()),
  intensitiesMmHr: z.array(z.number()),
  cumulativeMm: z.array(z.number()),
  totalDepthMm: z.number(),
  peakIndex: z.number().int(),
  params: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
});
export type HyetographOut = z.infer<typeof HyetographOut>;

export const DesignStormResponse = z.object({
  hyetograph: HyetographOut,
  engineVersion: z.string(),
});
export type DesignStormResponse = z.infer<typeof DesignStormResponse>;
