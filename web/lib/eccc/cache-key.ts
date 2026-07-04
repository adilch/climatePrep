import { createHash } from "node:crypto";

/**
 * Deterministic ECCC cache keys (spec §5.3):
 *   eccc:{source}:{collection}:{climate_id}:{period}:{paramsHash}
 * Same logical request → same key, across processes and deploys.
 */

/** Stable stringify: sorts object keys recursively so hashes are order-independent. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function paramsHash(params: unknown): string {
  return createHash("sha256")
    .update(stableStringify(params))
    .digest("hex")
    .slice(0, 16);
}

export function ecccCacheKey(opts: {
  source: string;
  collection: string;
  climateId?: string;
  period?: string;
  params?: unknown;
}): string {
  const climate = opts.climateId ?? "-";
  const period = (opts.period ?? "-").replaceAll("/", "_");
  return `eccc:${opts.source}:${opts.collection}:${climate}:${period}:${paramsHash(
    opts.params ?? {},
  )}`;
}
