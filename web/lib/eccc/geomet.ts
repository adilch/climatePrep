import * as blob from "@/lib/storage/blob";
import * as kv from "@/lib/storage/kv";
import { ecccCacheKey } from "./cache-key";
import {
  COLLECTIONS,
  GEOMET_BASE,
  type CollectionKey,
  type FeatureCollection,
  type FetchFeaturesOptions,
  type GeoJsonFeature,
} from "./types";

/**
 * MSC GeoMet OGC API – Features client (spec A2, §5.3).
 * - Paged fetch (limit 10 000 + offset — verified live)
 * - Retry with exponential backoff on 429/5xx/network
 * - Outbound rate limit (be a respectful OGL consumer)
 * - Response cache: KV pointer → raw GeoJSON in Blob, deterministic keys
 */

const PAGE_LIMIT = 10_000;
const MAX_RETRIES = 3;
const RATE_LIMIT_PER_SEC = 4;
const USER_AGENT = "climatePrep/0.1 (dam-safety meteorology; OGL-Canada consumer)";

/** Cache TTLs by collection family (spec §5.3): slow-moving data → long TTL. */
function cacheTtlSeconds(collection: string): number {
  if (collection.startsWith("ahccd") || collection === "climate-normals") {
    return 30 * 86_400;
  }
  if (collection === "climate-stations") return 7 * 86_400;
  return 86_400; // daily/hourly/monthly observations
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForRateLimit(): Promise<void> {
  // Spin briefly until a slot in the current 1 s window frees up.
  for (let i = 0; i < 50; i++) {
    if (await kv.rateLimit("api.weather.gc.ca", RATE_LIMIT_PER_SEC, 1)) return;
    await sleep(250);
  }
  throw new Error("ECCC rate limiter starved (too many concurrent pulls)");
}

function buildItemsUrl(
  collection: string,
  opts: FetchFeaturesOptions,
  limit: number,
  offset: number,
): URL {
  const u = new URL(`${GEOMET_BASE}/collections/${collection}/items`);
  u.searchParams.set("f", "json");
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  for (const [k, v] of Object.entries(opts.filters ?? {})) {
    u.searchParams.set(k, String(v));
  }
  if (opts.datetime) u.searchParams.set("datetime", opts.datetime);
  if (opts.bbox) u.searchParams.set("bbox", opts.bbox.join(","));
  if (opts.properties?.length) {
    u.searchParams.set("properties", opts.properties.join(","));
  }
  if (opts.sortby) u.searchParams.set("sortby", opts.sortby);
  return u;
}

async function fetchPage<P>(url: URL): Promise<FeatureCollection<P>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    await waitForRateLimit();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store", // we cache ourselves, deterministically
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`GeoMet ${res.status} for ${url.pathname}`);
        continue; // retryable
      }
      if (!res.ok) {
        throw new Error(`GeoMet ${res.status} for ${url.pathname}${url.search}`);
      }
      return (await res.json()) as FeatureCollection<P>;
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        lastError = err;
        continue; // retryable
      }
      if (err instanceof TypeError) {
        lastError = err; // network-level failure — retryable
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`GeoMet request failed after ${MAX_RETRIES + 1} attempts`);
}

export interface FetchResult<P> {
  features: GeoJsonFeature<P>[];
  numberMatched: number | null;
  /** First page URL — recorded as data_pulls.endpoint_url provenance. */
  endpointUrl: string;
}

/** Fetch every matching feature across pages (uncached). */
export async function fetchAllFeatures<P = Record<string, unknown>>(
  collectionKey: CollectionKey,
  opts: FetchFeaturesOptions = {},
): Promise<FetchResult<P>> {
  const collection = COLLECTIONS[collectionKey];
  const max = opts.maxFeatures ?? 500_000;
  const all: GeoJsonFeature<P>[] = [];
  let numberMatched: number | null = null;
  let offset = 0;
  let endpointUrl = "";

  while (all.length < max) {
    const limit = Math.min(PAGE_LIMIT, max - all.length);
    const url = buildItemsUrl(collection, opts, limit, offset);
    if (!endpointUrl) endpointUrl = url.toString();
    const page = await fetchPage<P>(url);
    const features = page.features ?? [];
    all.push(...features);
    if (typeof page.numberMatched === "number") {
      numberMatched = page.numberMatched;
    }
    if (features.length < limit) break;
    offset += features.length;
  }

  return { features: all, numberMatched: numberMatched ?? all.length, endpointUrl };
}

export interface CachedFetchResult<P> extends FetchResult<P> {
  fromCache: boolean;
  cacheKey: string;
  blobKey: string;
  fetchedAt: string;
}

interface CachePointer {
  blobKey: string;
  fetchedAt: string;
  numberMatched: number | null;
  endpointUrl: string;
}

/**
 * Cached fetch (spec §5.3): KV holds a pointer; the raw GeoJSON payload lives
 * in Blob under a deterministic key, so the cache also survives KV loss (the
 * local KV stub is in-memory) and repeat pulls are byte-identical.
 */
export async function fetchAllFeaturesCached<P = Record<string, unknown>>(
  collectionKey: CollectionKey,
  opts: FetchFeaturesOptions = {},
  meta: { climateId?: string; period?: string } = {},
): Promise<CachedFetchResult<P>> {
  const collection = COLLECTIONS[collectionKey];
  const cacheKey = ecccCacheKey({
    source: "msc_geomet",
    collection,
    climateId: meta.climateId,
    period: meta.period,
    params: opts,
  });
  const blobKey = `cache/${cacheKey.replaceAll(":", "/")}.json`;
  const ttl = cacheTtlSeconds(collection);

  // 1. KV pointer hit?
  const pointer = await kv.get<CachePointer>(cacheKey);
  if (pointer) {
    const raw = await blob.get(pointer.blobKey);
    if (raw) {
      const parsed = JSON.parse(raw.toString("utf8")) as FetchResult<P>;
      return { ...parsed, fromCache: true, cacheKey, blobKey: pointer.blobKey, fetchedAt: pointer.fetchedAt };
    }
  }

  // 2. KV miss but blob present and fresh? (KV stub is in-memory locally)
  const existing = await blob.get(blobKey);
  if (existing) {
    const parsed = JSON.parse(existing.toString("utf8")) as FetchResult<P> & {
      fetchedAt?: string;
    };
    const fetchedAt = parsed.fetchedAt ?? new Date(0).toISOString();
    const age = (Date.now() - Date.parse(fetchedAt)) / 1000;
    if (age < ttl) {
      await kv.set(
        cacheKey,
        {
          blobKey,
          fetchedAt,
          numberMatched: parsed.numberMatched,
          endpointUrl: parsed.endpointUrl,
        } satisfies CachePointer,
        { ex: ttl },
      );
      return {
        features: parsed.features,
        numberMatched: parsed.numberMatched,
        endpointUrl: parsed.endpointUrl,
        fromCache: true,
        cacheKey,
        blobKey,
        fetchedAt,
      };
    }
  }

  // 3. Fetch fresh, persist blob + pointer.
  const result = await fetchAllFeatures<P>(collectionKey, opts);
  const fetchedAt = new Date().toISOString();
  await blob.put(blobKey, JSON.stringify({ ...result, fetchedAt }));
  await kv.set(
    cacheKey,
    {
      blobKey,
      fetchedAt,
      numberMatched: result.numberMatched,
      endpointUrl: result.endpointUrl,
    } satisfies CachePointer,
    { ex: ttl },
  );
  return { ...result, fromCache: false, cacheKey, blobKey, fetchedAt };
}
