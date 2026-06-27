/**
 * Edge response cache for server-function results, backed by the Cloudflare
 * Workers Cache API (`caches.default`). Because our PSN/RAWG fetches are server
 * functions that execute in the worker, caching their derived results here
 * transparently covers BOTH the SSR route-loader path and client-side calls in
 * a single layer — cutting repeat hits to the unofficial PSN API and RAWG.
 *
 * Outside the worker (local dev under Node, vitest) there is no global `caches`,
 * so every call simply runs the producer with no caching — behaviour is then
 * identical to having no cache at all. Cache `match`/`put` failures are likewise
 * tolerated as a miss/no-op and never break the request.
 *
 * Only derived, JSON-serialisable response values are stored. Never cache
 * secrets (npsso/tokens) — callers key by an account hash or a query, not by a
 * credential.
 */

/** ~7 days, the staleness window we accept for PSN/RAWG data (see #107). */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Synthetic origin for cache-key requests; never actually fetched. */
const CACHE_ORIGIN = "https://psn-playtime.cache";

/** Header carrying our absolute expiry, checked against an injectable clock. */
const EXPIRES_HEADER = "x-edge-cache-expires";

/** The slice of the Cache API we depend on; satisfied by `caches.default`. */
export interface CacheLike {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
}

declare global {
  // `caches.default` is a Cloudflare Workers extension absent from the DOM
  // `CacheStorage` type; declare it rather than pulling in a types package.
  interface CacheStorage {
    readonly default: CacheLike;
  }
}

export interface CachedDeps {
  /** Inject a cache (tests); defaults to `caches.default` when available. */
  cache?: CacheLike;
  /** Inject the clock (tests); defaults to `Date.now`. */
  now?: () => number;
}

function resolveCache(injected: CacheLike | undefined): CacheLike | undefined {
  if (injected) return injected;
  if (typeof caches === "undefined") return undefined;
  try {
    return caches.default;
  } catch {
    return undefined;
  }
}

function keyRequest(key: string): Request {
  return new Request(`${CACHE_ORIGIN}/${key}`);
}

async function safeMatch(cache: CacheLike, request: Request): Promise<Response | undefined> {
  try {
    return await cache.match(request);
  } catch {
    return undefined;
  }
}

async function readFresh<T>(
  response: Response,
  now: number
): Promise<{ fresh: true; value: T } | { fresh: false }> {
  try {
    const expires = Number(response.headers.get(EXPIRES_HEADER));
    if (!Number.isFinite(expires) || now >= expires) return { fresh: false };
    // Deserialising an opaque cache body to the caller's T is inherently an
    // unchecked assertion; the producer's return type is the source of truth.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const value = (await response.json()) as T;
    return { fresh: true, value };
  } catch {
    return { fresh: false };
  }
}

async function safePut<T>(
  cache: CacheLike,
  request: Request,
  entry: { value: T; ttlMs: number; expiresAt: number }
): Promise<void> {
  try {
    const response = new Response(JSON.stringify(entry.value), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${Math.floor(entry.ttlMs / 1000)}`,
        [EXPIRES_HEADER]: String(entry.expiresAt),
      },
    });
    await cache.put(request, response);
  } catch {
    // A failed put must never break the request; the result is still returned.
  }
}

/**
 * Return `key`'s cached value when present and within `ttlMs`, else run
 * `producer`, store its result under `key`, and return it. A `producer` that
 * rejects propagates (nothing is stored). When no cache is available the
 * producer simply runs uncached.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
  deps: CachedDeps = {}
): Promise<T> {
  const cache = resolveCache(deps.cache);
  if (!cache) return producer();

  const now = deps.now ?? Date.now;
  const request = keyRequest(key);

  const hit = await safeMatch(cache, request);
  if (hit) {
    const result = await readFresh<T>(hit, now());
    if (result.fresh) return result.value;
  }

  const value = await producer();
  await safePut(cache, request, { value, ttlMs, expiresAt: now() + ttlMs });
  return value;
}
