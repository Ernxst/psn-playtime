import { afterEach, describe, expect, it, vi } from "vitest";
import { type CacheLike, cached } from "@/server/edge-cache";

const TTL = 1000;

/**
 * In-memory stand-in for the Workers Cache API. `match` returns a fresh clone
 * each call, mirroring the real cache (a stored response body is read-once), so
 * repeated hits don't fail on an already-consumed body.
 */
function fakeCache(): CacheLike {
  const store = new Map<string, Response>();
  return {
    match: (request) => Promise.resolve(store.get(request.url)?.clone()),
    put: (request, response) => {
      store.set(request.url, response);
      return Promise.resolve();
    },
  };
}

describe(".cached", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the producer and stores the result on a miss", async () => {
    const cache = fakeCache();
    const producer = vi.fn(() => Promise.resolve({ value: 1 }));

    const result = await cached("k", TTL, producer, { cache, now: () => 0 });

    expect(result).toEqual({ value: 1 });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("returns the cached value without running the producer on a hit within TTL", async () => {
    const cache = fakeCache();
    const producer = vi.fn(() => Promise.resolve({ value: 1 }));
    let now = 0;
    const deps = { cache, now: () => now };

    await cached("k", TTL, producer, deps);
    now = TTL - 1;
    const second = await cached("k", TTL, producer, deps);

    expect(second).toEqual({ value: 1 });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("re-runs the producer once the entry has expired", async () => {
    const cache = fakeCache();
    const producer = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });
    let now = 0;
    const deps = { cache, now: () => now };

    await cached("k", TTL, producer, deps);
    now = TTL;
    const second = await cached("k", TTL, producer, deps);

    expect(second).toEqual({ value: 2 });
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("isolates values stored under different keys", async () => {
    const cache = fakeCache();

    const a = await cached("a", TTL, () => Promise.resolve("A"), { cache, now: () => 0 });
    const b = await cached("b", TTL, () => Promise.resolve("B"), { cache, now: () => 0 });

    expect(a).toBe("A");
    expect(b).toBe("B");
  });

  it("runs the producer without caching when no cache is available", async () => {
    vi.stubGlobal("caches", undefined);
    const producer = vi.fn(() => Promise.resolve("x"));

    const first = await cached("k", TTL, producer, { now: () => 0 });
    const second = await cached("k", TTL, producer, { now: () => 0 });

    expect(first).toBe("x");
    expect(second).toBe("x");
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("treats a throwing match as a miss and still returns the producer result", async () => {
    const cache: CacheLike = {
      match: vi.fn(() => Promise.reject(new Error("match boom"))),
      put: vi.fn(() => Promise.resolve()),
    };
    const producer = vi.fn(() => Promise.resolve("x"));

    const result = await cached("k", TTL, producer, { cache, now: () => 0 });

    expect(result).toBe("x");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("returns the producer result when put throws", async () => {
    const cache: CacheLike = {
      match: vi.fn(() => Promise.resolve(undefined)),
      put: vi.fn(() => Promise.reject(new Error("put boom"))),
    };
    const producer = vi.fn(() => Promise.resolve("x"));

    const result = await cached("k", TTL, producer, { cache, now: () => 0 });

    expect(result).toBe("x");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("propagates a producer rejection and stores nothing", async () => {
    const cache: CacheLike = {
      match: vi.fn(() => Promise.resolve(undefined)),
      put: vi.fn(() => Promise.resolve()),
    };
    const producer = vi.fn(() => Promise.reject(new Error("nope")));

    await expect(cached("k", TTL, producer, { cache, now: () => 0 })).rejects.toThrow("nope");

    expect(cache.put).not.toHaveBeenCalled();
  });
});
