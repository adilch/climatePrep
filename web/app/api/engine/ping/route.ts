import { NextResponse } from "next/server";
import { EnginePingResponse } from "@climateprep/core-ts";

/**
 * Proxy to the Python compute engine (spec §3.5 swappable contract). The engine
 * runs as a separate service; ENGINE_URL points at it (local FastAPI now, a
 * Vercel Python function or standalone service later — no client change).
 */
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_URL}/api/engine/ping`, {
      // Always fresh — this is a liveness probe.
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`engine responded ${res.status}`);
    const parsed = EnginePingResponse.parse(await res.json());
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "engine_unreachable",
        detail: err instanceof Error ? err.message : String(err),
        engineUrl: ENGINE_URL,
      },
      { status: 503 },
    );
  }
}
