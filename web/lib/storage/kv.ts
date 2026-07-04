/**
 * Local KV stub (spec §3.3). Mirrors a minimal Upstash Redis / Vercel KV surface
 * (get/set/del with TTL) using an in-memory Map. On deploy, swap for
 * `@vercel/kv` / `@upstash/redis`. Used to cache ECCC responses, rate-limit
 * outbound calls, and mirror job status for fast polling.
 */
interface Entry {
  value: unknown;
  expiresAt: number | null;
}

const store = new Map<string, Entry>();

export async function set(
  key: string,
  value: unknown,
  opts?: { ex?: number },
): Promise<void> {
  store.set(key, {
    value,
    expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : null,
  });
}

export async function get<T = unknown>(key: string): Promise<T | null> {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function del(key: string): Promise<void> {
  store.delete(key);
}

/** Fixed-window rate-limit helper (spec §5.3). Returns true if allowed. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucketKey = `ratelimit:${key}:${Math.floor(
    Date.now() / 1000 / windowSeconds,
  )}`;
  const current = (await get<number>(bucketKey)) ?? 0;
  if (current >= limit) return false;
  await set(bucketKey, current + 1, { ex: windowSeconds });
  return true;
}
