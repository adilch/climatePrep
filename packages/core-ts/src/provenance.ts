import { z } from "zod";

/**
 * The provenance model is the crux of climatePrep (spec §5.2): every analysis
 * result must be reconstructable from source → method → version. These schemas
 * are the shared contract; the Drizzle tables and the Python pydantic models
 * must stay 1:1 with them (a CI parity check enforces this from M3 onward).
 */

export const DataSource = z.enum([
  "msc_geomet",
  "datamart",
  "bulk_csv",
  "ahccd",
  "eng_climate",
]);
export type DataSource = z.infer<typeof DataSource>;

/** Where a single ingested series came from (spec §5.1 data_pulls). */
export const DataPullProvenance = z.object({
  source: DataSource,
  climateId: z.string().nullable().optional(),
  wmoId: z.string().nullable().optional(),
  stationId: z.string(),
  endpointUrl: z.string(),
  collection: z.string(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  requestedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  rowCount: z.number().int().nonnegative().nullable().optional(),
  cacheKey: z.string().nullable().optional(),
  oglAttribution: z.boolean().default(true),
});
export type DataPullProvenance = z.infer<typeof DataPullProvenance>;

/**
 * The full chain stamped onto every persisted result and every exported number.
 * No result may be exported without a complete chain (spec §5.2, §9).
 */
export const ProvenanceChain = z.object({
  pulls: z.array(DataPullProvenance),
  method: z.string(),
  distribution: z.string().nullable().optional(),
  parameters: z.record(z.string(), z.unknown()).nullable().optional(),
  seed: z.number().int().nullable().optional(),
  engineVersion: z.string(),
  appVersion: z.string(),
});
export type ProvenanceChain = z.infer<typeof ProvenanceChain>;

export const OGL_CANADA_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Canada. " +
  "Source: Environment and Climate Change Canada (ECCC) / Meteorological Service of Canada (MSC).";

export const PROFESSIONAL_RESPONSIBILITY_DISCLAIMER =
  "This tool assists analysis; results must be reviewed and stamped by a qualified engineer. " +
  "Not a substitute for engineering judgment.";
