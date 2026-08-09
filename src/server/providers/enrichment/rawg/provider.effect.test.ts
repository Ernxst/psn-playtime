import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { HttpResponse, http, type ResponseResolver } from "msw";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type {
  FranchiseMatch,
  GameMetadataMatch,
} from "@/server/providers/enrichment/contract.effect";
import { TitleEnrichment } from "@/server/providers/enrichment/contract.effect";
import {
  prefetchFranchises,
  prefetchGameMetadata,
  TitleEnrichmentLayer,
} from "@/server/providers/enrichment/rawg/provider.effect";
import { server } from "@/test/msw";
import { RAWG_GAMES_URL, RAWG_SERIES_URL } from "@/test/msw-handlers";
import { rawgGame, rawgSearch, rawgSeries } from "@/test/rawg-fixtures";

const KEYED = Layer.provide(
  TitleEnrichmentLayer,
  ConfigProvider.layer(ConfigProvider.fromUnknown({ RAWG_API_KEY: "test-key" }))
);

const NO_KEY = Layer.provide(
  TitleEnrichmentLayer,
  ConfigProvider.layer(ConfigProvider.fromUnknown({}))
);

const useSearch = (resolver: ResponseResolver) => {
  const handler = vi.fn(resolver);
  server.use(http.get(RAWG_GAMES_URL, handler));
  return handler;
};

const useSeries = (resolver: ResponseResolver) => {
  const handler = vi.fn(resolver);
  server.use(http.get(RAWG_SERIES_URL, handler));
  return handler;
};

const searchResult = (overrides: { genres?: string[]; playtime?: number } = {}) =>
  HttpResponse.json(rawgSearch([rawgGame(overrides)]));

const runKeyed = <A, E>(effect: Effect.Effect<A, E, TitleEnrichment>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(KEYED)));

const runNoKey = <A, E>(effect: Effect.Effect<A, E, TitleEnrichment>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(NO_KEY)));

const metaProgram = (title: string) =>
  Effect.gen(function* () {
    const provider = yield* TitleEnrichment;
    return yield* provider.metadataFor(title);
  });

const franchiseProgram = (title: string) =>
  Effect.gen(function* () {
    const provider = yield* TitleEnrichment;
    return yield* provider.franchiseFor(title);
  });

const metadataFor = (title: string): Promise<GameMetadataMatch> => runKeyed(metaProgram(title));
const franchiseFor = (title: string): Promise<FranchiseMatch> => runKeyed(franchiseProgram(title));
const metadataForError = (title: string) => runKeyed(metaProgram(title).pipe(Effect.flip));
const franchiseForError = (title: string) => runKeyed(franchiseProgram(title).pipe(Effect.flip));

describe(".metadataFor", () => {
  it("returns absent metadata and skips the network when no key is set", async () => {
    const search = useSearch(() => searchResult({ genres: ["Action"] }));

    await expect(runNoKey(metaProgram("Celeste"))).resolves.toStrictEqual({
      matched: false,
      metadata: {},
    });

    expect(search).not.toHaveBeenCalled();
  });

  it("maps the first search result's genres to a Genre", async () => {
    const search = useSearch(({ request }) => {
      const url = new URL(request.url);
      const valid =
        url.searchParams.get("search") === "Returnal" &&
        url.searchParams.get("key") === "test-key" &&
        url.searchParams.get("page_size") === "1";
      return valid
        ? searchResult({ genres: ["Action", "Shooter"] })
        : HttpResponse.json(rawgSearch());
    });

    await expect(metadataFor("Returnal")).resolves.toStrictEqual({
      matched: true,
      metadata: { genre: "Action-Adventure" },
    });

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("returns the genre and typical playtime from one shared request", async () => {
    const search = useSearch(() => searchResult({ genres: ["Action"], playtime: 25 }));

    await expect(metadataFor("Celeste")).resolves.toStrictEqual({
      matched: true,
      metadata: { genre: "Action-Adventure", typicalPlaytime: 25 },
    });

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("caches a result so a repeated lookup hits the network once", async () => {
    const search = useSearch(() => searchResult({ genres: ["Racing"] }));

    const [first, second] = await runKeyed(
      Effect.gen(function* () {
        const provider = yield* TitleEnrichment;
        const a = yield* provider.metadataFor("Gran Turismo 7");
        const b = yield* provider.metadataFor("Gran Turismo 7");
        return [a, b] as const;
      })
    );

    expect(first.metadata.genre).toBe("Racing");
    expect(second.metadata.genre).toBe("Racing");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("returns absent metadata when the search yields no mappable genre", async () => {
    useSearch(() => searchResult({ genres: ["Simulation"] }));

    await expect(metadataFor("Powerwash Simulator")).resolves.toStrictEqual({
      matched: true,
      metadata: {},
    });
  });

  it("treats a playtime of 0 as no data", async () => {
    useSearch(() => searchResult({ playtime: 0 }));

    await expect(metadataFor("Some Game")).resolves.toStrictEqual({ matched: true, metadata: {} });
  });

  it("returns absent metadata for a genuine empty search result", async () => {
    useSearch(() => HttpResponse.json(rawgSearch()));

    await expect(metadataFor("Totally Unknown Title")).resolves.toStrictEqual({
      matched: false,
      metadata: {},
    });
  });

  it("surfaces a non-ok response as an UpstreamUnavailableError on the typed channel", async () => {
    useSearch(() => new HttpResponse("nope", { status: 503 }));

    const error = await metadataForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("surfaces a transport failure as an UpstreamUnavailableError on the typed channel", async () => {
    useSearch(() => HttpResponse.error());

    const error = await metadataForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("surfaces an invalid-JSON payload as an UpstreamUnavailableError on the typed channel", async () => {
    useSearch(() => HttpResponse.json({ results: "not-an-array" }));

    const error = await metadataForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("keeps the API key off an UpstreamUnavailableError after an MSW transport failure", async () => {
    useSearch(() => HttpResponse.error());

    const error = await metadataForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(JSON.stringify(error)).not.toContain("test-key");
    expect(String(error)).not.toContain("test-key");
    expect(error.message).not.toContain("test-key");
  });

  it("preserves a matched result with no usable genres as incomplete metadata", async () => {
    useSearch(() => HttpResponse.json(rawgSearch([rawgGame({ name: "Some Game" })])));

    await expect(metadataFor("Some Game")).resolves.toStrictEqual({ matched: true, metadata: {} });
  });

  it("skips the network when the name normalizes to an empty query", async () => {
    const search = useSearch(() => searchResult());

    await expect(metadataFor("™®©")).resolves.toStrictEqual({ matched: false, metadata: {} });

    expect(search).not.toHaveBeenCalled();
  });

  it("surfaces a 429 as a RateLimitedError on the typed channel", async () => {
    useSearch(() => new HttpResponse("slow down", { status: 429 }));

    const error = await metadataForError("Busy Game");

    expect(error._tag).toBe("RateLimitedError");
    expect(error.provider).toBe("rawg");
  });

  it("sends the API key on the request but keeps it off the typed error", async () => {
    const search = useSearch(
      ({ request }) =>
        new HttpResponse(
          new URL(request.url).searchParams.get("key") === "test-key" ? "slow down" : "missing key",
          {
            status: 429,
          }
        )
    );

    const error = await metadataForError("Busy Game");

    expect(search).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error)).not.toContain("test-key");
    expect(String(error)).not.toContain("test-key");
    expect(error.message).not.toContain("test-key");
  });
});

describe(".franchiseFor", () => {
  it("returns undefined and skips the network when no key is set", async () => {
    const search = useSearch(() => searchResult());

    await expect(runNoKey(franchiseProgram("Celeste"))).resolves.toStrictEqual({ matched: false });

    expect(search).not.toHaveBeenCalled();
  });

  it("derives a franchise from the matched game and its series", async () => {
    const search = useSearch(({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("search") === "Forza Horizon 5"
          ? rawgSearch([rawgGame({ id: 42, name: "Forza Horizon 5" })])
          : rawgSearch()
      )
    );
    const series = useSeries(({ request }) =>
      HttpResponse.json(
        new URL(request.url).pathname.endsWith("/42/game-series")
          ? rawgSeries(["Forza Horizon 4", "Forza Motorsport 7"])
          : rawgSeries()
      )
    );

    await expect(franchiseFor("Forza Horizon 5")).resolves.toStrictEqual({
      matched: true,
      franchise: "Forza",
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(series).toHaveBeenCalledTimes(1);
  });

  it("caches a result so a repeated lookup hits the network once", async () => {
    const search = useSearch(() =>
      HttpResponse.json(rawgSearch([rawgGame({ id: 1, name: "God of War Ragnarök" })]))
    );
    const series = useSeries(() => HttpResponse.json(rawgSeries(["God of War"])));

    const [first, second] = await runKeyed(
      Effect.gen(function* () {
        const provider = yield* TitleEnrichment;
        const a = yield* provider.franchiseFor("God of War Ragnarök");
        const b = yield* provider.franchiseFor("God of War Ragnarök");
        return [a, b] as const;
      })
    );

    expect(first).toStrictEqual({ matched: true, franchise: "God of War" });
    expect(second).toStrictEqual({ matched: true, franchise: "God of War" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(series).toHaveBeenCalledTimes(1);
  });

  it("returns undefined and skips the series request when the search has no match", async () => {
    const search = useSearch(() => HttpResponse.json(rawgSearch()));
    const series = useSeries(() => HttpResponse.json(rawgSeries(["unused"])));

    await expect(franchiseFor("Totally Unknown Title")).resolves.toStrictEqual({ matched: false });

    expect(search).toHaveBeenCalledTimes(1);
    expect(series).not.toHaveBeenCalled();
  });

  it("returns undefined when the matched game belongs to no series", async () => {
    useSearch(() => HttpResponse.json(rawgSearch([rawgGame({ id: 7, name: "Stray" })])));
    useSeries(() => HttpResponse.json(rawgSeries()));

    await expect(franchiseFor("Stray")).resolves.toStrictEqual({ matched: true });
  });

  it("surfaces a matched game with no id as an invalid response", async () => {
    useSearch(() => HttpResponse.json(rawgSearch([{ name: "no id here", genres: [] }])));

    const error = await franchiseForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
  });

  it("surfaces a non-ok series response as an UpstreamUnavailableError", async () => {
    useSearch(() => HttpResponse.json(rawgSearch([rawgGame({ id: 7, name: "Stray" })])));
    useSeries(() => new HttpResponse("nope", { status: 503 }));

    const error = await franchiseForError("Stray");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("surfaces a non-ok search response as an UpstreamUnavailableError", async () => {
    useSearch(() => new HttpResponse("nope", { status: 503 }));

    const error = await franchiseForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("surfaces a transport failure as an UpstreamUnavailableError", async () => {
    useSearch(() => HttpResponse.error());

    const error = await franchiseForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("surfaces an invalid-JSON search payload as an UpstreamUnavailableError", async () => {
    useSearch(() => HttpResponse.json({ results: "not-an-array" }));

    const error = await franchiseForError("Some Game");

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("rawg");
  });

  it("surfaces a 429 search response as a RateLimitedError", async () => {
    useSearch(() => new HttpResponse("slow down", { status: 429 }));

    const error = await franchiseForError("Busy Game");

    expect(error._tag).toBe("RateLimitedError");
    expect(error.provider).toBe("rawg");
  });

  it("skips the network when the name normalizes to an empty query", async () => {
    const search = useSearch(() => searchResult());

    await expect(franchiseFor("™®©")).resolves.toStrictEqual({ matched: false });

    expect(search).not.toHaveBeenCalled();
  });
});

describe("shared game-info search across genre and franchise", () => {
  it("issues one search when the same title is enriched for both genre and franchise", async () => {
    const search = useSearch(() =>
      HttpResponse.json(
        rawgSearch([rawgGame({ id: 9, name: "Halo Infinite", genres: ["Shooter"], playtime: 12 })])
      )
    );
    const series = useSeries(() => HttpResponse.json(rawgSeries(["Halo Infinite", "Halo 5"])));

    const [metadata, franchise] = await runKeyed(
      Effect.gen(function* () {
        const provider = yield* TitleEnrichment;
        const m = yield* provider.metadataFor("Halo Infinite");
        const f = yield* provider.franchiseFor("Halo Infinite");
        return [m, f] as const;
      })
    );

    expect(metadata).toStrictEqual({
      matched: true,
      metadata: { genre: "Shooter", typicalPlaytime: 12 },
    });
    expect(franchise).toStrictEqual({ matched: true, franchise: "Halo" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(series).toHaveBeenCalledTimes(1);
  });
});

describe("concurrent cache-miss dedup", () => {
  it("coalesces two concurrent misses for the same title into one search", async () => {
    const search = useSearch(() =>
      HttpResponse.json(
        rawgSearch([rawgGame({ id: 9, name: "Halo Infinite", genres: ["Shooter"], playtime: 12 })])
      )
    );
    useSeries(() => HttpResponse.json(rawgSeries(["Halo Infinite", "Halo 5"])));

    const [metadata, franchise] = await runKeyed(
      Effect.all([metaProgram("Halo Infinite"), franchiseProgram("Halo Infinite")], {
        concurrency: "unbounded",
      })
    );

    expect(metadata).toStrictEqual({
      matched: true,
      metadata: { genre: "Shooter", typicalPlaytime: 12 },
    });
    expect(franchise).toStrictEqual({ matched: true, franchise: "Halo" });
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("transient failures are not cached", () => {
  it("re-runs the search after an infrastructure failure rather than retaining it", async () => {
    const search = useSearch(
      vi
        .fn()
        .mockReturnValueOnce(new HttpResponse("nope", { status: 503 }))
        .mockReturnValue(searchResult({ genres: ["Action"] }))
    );
    const runtime = ManagedRuntime.make(KEYED);
    onTestFinished(() => runtime.dispose());
    const lookup = metaProgram("Hades");

    const error = await runtime.runPromise(lookup.pipe(Effect.flip));

    expect(error._tag).toBe("UpstreamUnavailableError");

    const metadata = await runtime.runPromise(lookup);

    expect(metadata).toStrictEqual({ matched: true, metadata: { genre: "Action-Adventure" } });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("re-runs a genuine no-match so a later retry can resolve the title", async () => {
    const search = useSearch(
      vi
        .fn()
        .mockReturnValueOnce(HttpResponse.json(rawgSearch()))
        .mockReturnValue(searchResult({ genres: ["Action"] }))
    );
    const runtime = ManagedRuntime.make(KEYED);
    onTestFinished(() => runtime.dispose());
    const lookup = metaProgram("Hades");

    await expect(runtime.runPromise(lookup)).resolves.toStrictEqual({
      matched: false,
      metadata: {},
    });
    await expect(runtime.runPromise(lookup)).resolves.toStrictEqual({
      matched: true,
      metadata: { genre: "Action-Adventure" },
    });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe("process-lived cache across a shared runtime", () => {
  it("reuses the cache between two separate runtime invocations", async () => {
    const search = useSearch(() => searchResult({ genres: ["Racing"] }));
    const runtime = ManagedRuntime.make(KEYED);
    onTestFinished(() => runtime.dispose());
    const lookup = metaProgram("Gran Turismo 7");

    const first = await runtime.runPromise(lookup);
    const second = await runtime.runPromise(lookup);

    expect(first.metadata.genre).toBe("Racing");
    expect(second.metadata.genre).toBe("Racing");
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("prefetch boundary outcomes", () => {
  it("keeps settled metadata while counting a never-settling RAWG search as failed", async () => {
    useSearch(({ request }) =>
      new URL(request.url).searchParams.get("search") === "Never Settles"
        ? new Promise<never>(() => undefined)
        : searchResult({ genres: ["Action"] })
    );

    const result = await runKeyed(prefetchGameMetadata(["Settles", "Never Settles"]));

    expect(result).toStrictEqual({
      availability: "available",
      values: new Map([["Settles", { matched: true, metadata: { genre: "Action-Adventure" } }]]),
      failures: 1,
    });
  }, 3_000);

  it("keeps settled franchises while counting a never-settling RAWG series response as failed", async () => {
    useSearch(({ request }) => {
      const name = new URL(request.url).searchParams.get("search");
      return HttpResponse.json(
        rawgSearch([rawgGame({ id: name === "Never Settles" ? 2 : 1, name: name ?? "" })])
      );
    });
    useSeries(({ request }) =>
      new URL(request.url).pathname.endsWith("/2/game-series")
        ? new Promise<never>(() => undefined)
        : HttpResponse.json(rawgSeries(["Forza Horizon 4"]))
    );

    const result = await runKeyed(prefetchFranchises(["Forza Horizon 5", "Never Settles"]));

    expect(result).toStrictEqual({
      availability: "available",
      values: new Map([["Forza Horizon 5", { matched: true, franchise: "Forza Horizon" }]]),
      failures: 1,
    });
  }, 3_000);

  it("preserves an upstream failure as batch evidence", async () => {
    useSearch(() => new HttpResponse("nope", { status: 503 }));

    const result = await runKeyed(prefetchGameMetadata(["Some Game"]));

    expect(result).toStrictEqual({ availability: "available", values: new Map(), failures: 1 });
  });

  it("preserves a rate limit as batch evidence", async () => {
    useSearch(() => new HttpResponse("slow down", { status: 429 }));

    const result = await runKeyed(prefetchGameMetadata(["Busy Game"]));

    expect(result).toStrictEqual({ availability: "available", values: new Map(), failures: 1 });
  });

  it("preserves a franchise failure as batch evidence", async () => {
    useSearch(() => new HttpResponse("nope", { status: 503 }));

    const result = await runKeyed(prefetchFranchises(["Some Game"]));

    expect(result).toStrictEqual({ availability: "available", values: new Map(), failures: 1 });
  });
});
