import {
  AggregateResponse,
  InfillResponse,
  TrendResponse,
} from "@climateprep/core-ts";

/**
 * Typed client for the compute engine (spec §3.5). Every response is parsed
 * against the shared Zod contract, so drift fails loudly at the boundary.
 */
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`engine ${res.status} on ${path}: ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function engineTrend(body: unknown): Promise<TrendResponse> {
  return TrendResponse.parse(await post("/api/engine/qc/trend", body));
}

export async function engineAggregate(body: unknown): Promise<AggregateResponse> {
  return AggregateResponse.parse(await post("/api/engine/qc/aggregate", body));
}

export async function engineInfill(body: unknown): Promise<InfillResponse> {
  return InfillResponse.parse(await post("/api/engine/qc/infill", body));
}
