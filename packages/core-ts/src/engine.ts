import { z } from "zod";

/**
 * Engine HTTP contract (spec §3.5). All engine endpoints are stateless POST
 * (except the M0 ping GET) with JSON in/out. These Zod schemas mirror the
 * Python pydantic models in `engine/` and `packages/core-engine`. Keep the
 * contract clean so the compute location stays swappable (Vercel Python fn or
 * a standalone FastAPI service — spec §3.2 escape hatch).
 */

/** Every engine response carries the engine version (spec §3.5, §9). */
export const EngineMeta = z.object({
  engineVersion: z.string(),
});
export type EngineMeta = z.infer<typeof EngineMeta>;

/** GET /api/engine/ping — M0 liveness + version proof. */
export const EnginePingResponse = z.object({
  ok: z.literal(true),
  service: z.string(),
  engineVersion: z.string(),
  python: z.string(),
});
export type EnginePingResponse = z.infer<typeof EnginePingResponse>;

/* ---------------------------------------------------------------------------
 * PFA contract skeleton (spec §3.5 / M3). Mirrors the WSC FFA engine models
 * (FrequencyRequest/FrequencyResponse). Defined here now so the domain is
 * documented; the full engine implementation lands in M3.
 * ------------------------------------------------------------------------- */

export const Distribution = z.enum(["gumbel", "gev", "glo", "pe3", "lp3"]);
export type Distribution = z.infer<typeof Distribution>;

export const EstimationMethod = z.enum(["lmoments", "mom", "mle"]);
export type EstimationMethod = z.infer<typeof EstimationMethod>;
