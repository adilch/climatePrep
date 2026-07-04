import { randomUUID } from "node:crypto";

/**
 * Local queue stub (spec §2.5, §3.3). Mirrors the QStash `publishJSON` surface
 * but runs the handler inline (no durable queue locally). Heavy async jobs
 * (large multi-duration bootstraps, PMP, regional pooling) arrive in M3; for now
 * this documents the contract and keeps enqueue call sites deploy-ready.
 *
 * On deploy, swap for `@upstash/qstash` so jobs run in an extended-duration
 * Python function with callbacks (spec §2.5).
 */
export interface EnqueueResult {
  jobId: string;
  status: "done" | "queued";
}

export async function enqueue<T>(
  handler: (payload: T) => Promise<unknown>,
  payload: T,
): Promise<EnqueueResult> {
  const jobId = randomUUID();
  // Local: run synchronously so results are immediately available.
  await handler(payload);
  return { jobId, status: "done" };
}
