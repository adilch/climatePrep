import { z } from "zod";

export * from "./provenance";
export * from "./engine";
export * from "./qc";

/**
 * Shared domain enums used by both the Drizzle schema and the UI/forms.
 * Keep these aligned with the Postgres enums in `web/lib/db/schema.ts`.
 */

/** Project lifecycle state machine (spec §2.4). Non-blocking UI hints. */
export const ProjectStatus = z.enum([
  "draft",
  "data_acquired",
  "qa_complete",
  "analyses_in_progress",
  "report_ready",
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** CDA consequence classification (spec §5.1 dams). */
export const CdaConsequenceCategory = z.enum([
  "low",
  "significant",
  "high",
  "very_high",
  "extreme",
]);
export type CdaConsequenceCategory = z.infer<typeof CdaConsequenceCategory>;

/** Input schema for creating a project (shared by the API route + form). */
export const CreateProjectInput = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().default(""),
});
/** Parsed (output) type — description is always present. */
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;
/** Form (input) type — description optional before defaults apply. */
export type CreateProjectFormValues = z.input<typeof CreateProjectInput>;
