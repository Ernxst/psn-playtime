import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameMetadata } from "@/server/providers/enrichment/contract.effect";
import { EnrichmentProvider } from "@/server/providers/enrichment/contract.effect";
import { EnrichmentProviderLayer } from "@/server/providers/enrichment/rawg/provider.effect";

/**
 * Provider-level port of the old `rawg.ts` network tests (no-key gate, genre
 * mapping, caching, every-failure-to-absent fallback, empty-query skip) plus the
 * new behaviour the Effect port adds: a genuine HTTP 429 surfaces as a
 * `ProviderRateLimitedError` on the typed channel.
 *
 * The `RAWG_API_KEY` gate is read through `Config`. Rather than mutate
 * `process.env` (the default provider snapshots it once), each run supplies the
 * key via an explicit `ConfigProvider` layer; fetches still go through
 * `FetchHttpClient`, which uses the spied `globalThis.fetch`.
 */

/** A RAWG layer whose `Config` sees `RAWG_API_KEY` set to `test-key`. */
const KEYED = Layer.provide(
  EnrichmentProviderLayer,
  ConfigProvider.layer(ConfigProvider.fromUnknown({ RAWG_API_KEY: "test-key" }))
);

/** A RAWG layer whose `Config` sees no `RAWG_API_KEY` (the no-op gate). */
const NO_KEY = Layer.provide(
  EnrichmentProviderLayer,
  ConfigProvider.layer(ConfigProvider.fromUnknown({}))
);

function searchResponse(result: { genres?: string[]; playtime?: number }): Response {
  const genres = result.genres?.map((name) => ({ name }));
  return new Response(JSON.stringify({ results: [{ genres, playtime: result.playtime }] }), {
    status: 200,
  });
}

function gameMatchResponse(id: number, name: string): Response {
  return new Response(JSON.stringify({ results: [{ id, name }] }), { status: 200 });
}

function seriesResponse(names: string[]): Response {
  return new Response(JSON.stringify({ results: names.map((name) => ({ name })) }), {
    status: 200,
  });
}

/**
 * `FetchHttpClient.Fetch` is a `Context.Reference` memoized on the shared
 * default runtime, so the first test's `fetch` spy would otherwise be reused by
 * every later test. Delegating live to `globalThis.fetch` per call means each
 * run sees the spy installed by the test currently executing.
 */
const liveFetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);

const runKeyed = <A, E>(effect: Effect.Effect<A, E, EnrichmentProvider>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provide(KEYED), Effect.provideService(FetchHttpClient.Fetch, liveFetch))
  );

const runNoKey = <A, E>(effect: Effect.Effect<A, E, EnrichmentProvider>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provide(NO_KEY), Effect.provideService(FetchHttpClient.Fetch, liveFetch))
  );

const metaProgram = (title: string) =>
  Effect.gen(function* () {
    const provider = yield* EnrichmentProvider;
    return yield* provider.fetchGameMetadata(title);
  });

const franchiseProgram = (title: string) =>
  Effect.gen(function* () {
    const provider = yield* EnrichmentProvider;
    return yield* provider.fetchFranchise(title);
  });

const fetchGameMetadata = (title: string): Promise<GameMetadata> => runKeyed(metaProgram(title));

const fetchFranchise = (title: string): Promise<string | undefined> =>
  runKeyed(franchiseProgram(title));

/** Run a metadata lookup, flipping the typed error onto the success channel. */
const fetchGameMetadataError = (title: string) => runKeyed(metaProgram(title).pipe(Effect.flip));

/** The URL `FetchHttpClient` passed on call `index` (it always passes a `URL`). */
const fetchUrlAt = (spy: ReturnType<typeof vi.spyOn>, index: number): string => {
  const arg: unknown = spy.mock.calls[index]?.[0];
  return arg instanceof URL ? arg.href : "";
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe(".fetchGameMetadata", () => {
  it("returns absent metadata and skips the network when no key is set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(runNoKey(metaProgram("Celeste"))).resolves.toEqual({});

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps the first search result's genres to a Genre", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(searchResponse({ genres: ["Action", "Shooter"] }));

    await expect(fetchGameMetadata("Returnal")).resolves.toMatchObject({
      genre: "Action-Adventure",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchUrlAt(fetchSpy, 0)).toContain("search=Returnal");
  });

  it("returns the genre and typical playtime from one shared request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(searchResponse({ genres: ["Action"], playtime: 25 }));

    await expect(fetchGameMetadata("Celeste")).resolves.toEqual({
      genre: "Action-Adventure",
      typicalPlaytime: 25,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches a result so a repeated lookup hits the network once", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(searchResponse({ genres: ["Racing"] }));

    const [first, second] = await runKeyed(
      Effect.gen(function* () {
        const provider = yield* EnrichmentProvider;
        const a = yield* provider.fetchGameMetadata("Gran Turismo 7");
        const b = yield* provider.fetchGameMetadata("Gran Turismo 7");
        return [a, b] as const;
      })
    );

    expect(first.genre).toBe("Racing");
    expect(second.genre).toBe("Racing");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns absent metadata when the search yields no mappable genre", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(searchResponse({ genres: ["Simulation"] }));

    await expect(fetchGameMetadata("Powerwash Simulator")).resolves.toEqual({});
  });

  it("treats a playtime of 0 as no data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(searchResponse({ playtime: 0 }));

    await expect(fetchGameMetadata("Some Game")).resolves.toEqual({});
  });

  it("falls back to absent on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(fetchGameMetadata("Some Game")).resolves.toEqual({});
  });

  it("falls back to absent when the request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(fetchGameMetadata("Some Game")).resolves.toEqual({});
  });

  it("falls back to absent when the response payload fails schema validation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: "not-an-array" }), { status: 200 })
    );

    await expect(fetchGameMetadata("Some Game")).resolves.toEqual({});
  });

  it("returns absent for a result with no genres array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{}] }), { status: 200 })
    );

    await expect(fetchGameMetadata("Some Game")).resolves.toEqual({});
  });

  it("skips the network when the name normalizes to an empty query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(fetchGameMetadata("™®©")).resolves.toEqual({});

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a 429 as a ProviderRateLimitedError on the typed channel", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("slow down", { status: 429 }));

    const error = await fetchGameMetadataError("Busy Game");

    expect(error._tag).toBe("ProviderRateLimitedError");
    expect(error.provider).toBe("rawg");
  });
});

describe(".fetchFranchise", () => {
  it("returns undefined and skips the network when no key is set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(runNoKey(franchiseProgram("Celeste"))).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("derives a franchise from the matched game and its series", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gameMatchResponse(42, "Forza Horizon 5"))
      .mockResolvedValueOnce(seriesResponse(["Forza Horizon 4", "Forza Motorsport 7"]));

    await expect(fetchFranchise("Forza Horizon 5")).resolves.toBe("Forza");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchUrlAt(fetchSpy, 0)).toContain("search=Forza");
    expect(fetchUrlAt(fetchSpy, 1)).toContain("/42/game-series");
  });

  it("caches a result so a repeated lookup hits the network once", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gameMatchResponse(1, "God of War Ragnarök"))
      .mockResolvedValueOnce(seriesResponse(["God of War"]));

    const [first, second] = await runKeyed(
      Effect.gen(function* () {
        const provider = yield* EnrichmentProvider;
        const a = yield* provider.fetchFranchise("God of War Ragnarök");
        const b = yield* provider.fetchFranchise("God of War Ragnarök");
        return [a, b] as const;
      })
    );

    expect(first).toBe("God of War");
    expect(second).toBe("God of War");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns undefined and skips the series request when the search has no match", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    await expect(fetchFranchise("Totally Unknown Title")).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the matched game belongs to no series", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gameMatchResponse(7, "Stray"))
      .mockResolvedValueOnce(seriesResponse([]));

    await expect(fetchFranchise("Stray")).resolves.toBeUndefined();
  });

  it("returns undefined when the series request is non-ok", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gameMatchResponse(7, "Stray"))
      .mockResolvedValueOnce(new Response("nope", { status: 503 }));

    await expect(fetchFranchise("Stray")).resolves.toBeUndefined();
  });

  it("falls back to undefined on a non-ok search response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(fetchFranchise("Some Game")).resolves.toBeUndefined();
  });

  it("falls back to undefined when the search request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(fetchFranchise("Some Game")).resolves.toBeUndefined();
  });

  it("falls back to undefined when the search payload fails schema validation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ name: "no id here" }] }), { status: 200 })
    );

    await expect(fetchFranchise("Some Game")).resolves.toBeUndefined();
  });

  it("skips the network when the name normalizes to an empty query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(fetchFranchise("™®©")).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
