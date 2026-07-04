import { createHash } from "node:crypto";
import { stableStringify } from "@/lib/eccc/cache-key";

/**
 * Deterministic hash of analysis inputs + upstream data-pull ids
 * (spec §5.1 analyses.input_hash). Same inputs → same hash across runs,
 * key order, and deploys — enables result reuse and staleness detection.
 */
export function analysisInputHash(
  inputs: unknown,
  upstreamPullIds: string[] = [],
): string {
  return createHash("sha256")
    .update(stableStringify({ inputs, pulls: [...upstreamPullIds].sort() }))
    .digest("hex");
}
