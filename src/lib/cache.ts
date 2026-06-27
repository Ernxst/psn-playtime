/**
 * Tiny typed `localStorage` cache with a TTL (#107).
 *
 * PSN/RAWG data barely changes day-to-day, yet every client-side dashboard fetch
 * re-runs the npsso→token exchange and re-pulls playtime/trophies/genres. This
 * caches the *derived* data (never secrets) so a fresh entry short-circuits the
 * call. Entries are namespaced and optionally keyed by PSN account so different
 * sign-ins don't collide. All access is best-effort: quota errors and
 * malformed/old entries are treated as a miss, never thrown.
 */

const NAMESPACE = "psn-playtime:cache";

/** Marks which account the account-keyed entries currently belong to. */
const ACTIVE_ACCOUNT_KEY = `${NAMESPACE}:active-account`;

/** ~7 days. A week of staleness is acceptable for playtime/trophies/genres. */
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CacheKey {
  /** Logical name of the cached resource, e.g. `"dashboard"`. */
  name: string;
  /** PSN accountId the data belongs to, when account-specific. */
  account?: string;
}

export interface CacheOptions {
  /** Override the default TTL, in milliseconds. */
  ttlMs?: number;
  /** Injectable clock (epoch ms); defaults to `Date.now`. */
  now?: () => number;
}

interface Entry<T> {
  cachedAt: number;
  value: T;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storageKey({ name, account }: CacheKey): string {
  return account ? `${NAMESPACE}:${account}:${name}` : `${NAMESPACE}:${name}`;
}

function isEntry(value: unknown): value is Entry<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "cachedAt" in value &&
    typeof (value as { cachedAt: unknown }).cachedAt === "number" &&
    "value" in value
  );
}

function readRaw(key: CacheKey): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(storageKey(key));
  } catch {
    return null;
  }
}

function parseEntry(raw: string): Entry<unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isFresh(entry: Entry<unknown>, options: CacheOptions): boolean {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  return now() - entry.cachedAt <= ttlMs;
}

/** Read a cached value, or `null` when absent, malformed, or past its TTL. */
export function readCache<T>(key: CacheKey, options: CacheOptions = {}): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  const entry = parseEntry(raw);
  if (entry === null || !isFresh(entry, options)) return null;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller asserts the stored shape
  return entry.value as T;
}

/** Stamp and persist a value. Quota/serialisation errors are swallowed. */
export function writeCache<T>(key: CacheKey, value: T, options: CacheOptions = {}): void {
  const store = storage();
  if (!store) return;
  const now = options.now ?? Date.now;
  const entry: Entry<T> = { cachedAt: now(), value };
  try {
    store.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Quota exceeded or serialisation failure — caching is best-effort.
  }
}

/** Remove a cached entry. */
export function clearCache(key: CacheKey): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(storageKey(key));
  } catch {
    // Best-effort.
  }
}

/** The account whose cached data is currently active, or `null`. */
export function getActiveAccount(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

/** Record which account the account-keyed entries belong to. */
export function setActiveAccount(account: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(ACTIVE_ACCOUNT_KEY, account);
  } catch {
    // Best-effort.
  }
}

/** Forget the active account (e.g. on sign-out). */
export function clearActiveAccount(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    // Best-effort.
  }
}
