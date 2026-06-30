/**
 * RAWG-backed implementation of the `TitleEnrichment` port (phase E4).
 *
 * Behaviour mirrors the previous `rawg.ts` lookups exactly:
 * - The `RAWG_API_KEY` gate is modelled as the layer resolving to a no-op
 *   provider (every lookup is a successful absence) when the key is unset, so
 *   callers fall back to their keyword result and the network is never touched.
 * - A transport error, a non-OK response, or a body that fails schema
 *   validation all recover to the success-absent value — today's fallback.
 * - A genuine HTTP 429 is surfaced as `RateLimitedError`; the prefetch
 *   builders recover it (and `UpstreamUnavailableError`) back to absence, so the
 *   server-fn boundary still never throws on enrichment failure.
 *
 * Networking goes through `@effect/platform`'s fetch-based `HttpClient` (it lives
 * in core `effect/unstable/http` for the v4 beta line; `@effect/platform@4` is
 * not published). `FetchHttpClient.layer` uses `globalThis.fetch`, so it runs on
 * the Nitro/Cloudflare-Workers runtime as well as in Node/tests. The lookup
 * cache is a `Ref<Map>` built once per layer construction; this layer is folded
 * into the app-scoped `ServerLayer` (`runtime.effect.ts`), so the cache is built
 * once per worker process and lives for the runtime's lifetime, giving
 * cross-request hits. RAWG metadata is effectively static, so there are no
 * stale-data concerns, and the maps stay bounded by the distinct title names a
 * worker ever sees, so no eviction is needed.
 */
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  TitleEnrichment,
  type TitleEnrichmentShape,
  type GameMetadata,
} from "@/server/providers/enrichment/contract.effect";
import {
  deriveFranchise,
  mapRawgGenres,
  normalizeForSearch,
  normalizePlaytime,
} from "@/server/providers/enrichment/rawg/client";
import { RateLimitedError } from "@/server/providers/errors.effect";

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";

/** Max RAWG lookups in flight at once, matching the previous batch size. */
const RAWG_LOOKUP_CONCURRENCY = 8;

/** A successful "no usable data" result — the caller keeps its keyword fallback. */
const ABSENT_METADATA: GameMetadata = {};

/**
 * Everything a single `/games?search=` round-trip yields that either lookup
 * needs: `id`/`name` for the series request, `genres`/`playtime` for metadata.
 * One decode serves both so genre and franchise enrichment share one search.
 */
type GameInfo = {
  readonly id: number | undefined;
  readonly name: string | undefined;
  readonly genres: ReadonlyArray<string>;
  readonly playtime: number | undefined;
};

/** Typed absences, named so they read as values rather than `Effect.void`. */
const NO_GAME: GameInfo | undefined = undefined;
const NO_FRANCHISE: string | undefined = undefined;
const NO_SERIES: ReadonlyArray<string> = [];

/**
 * The slice of the RAWG `/games` search payload both lookups share. `id`/`name`
 * are optional because the metadata path doesn't require them and a malformed
 * result should degrade to absence rather than fail the whole decode.
 */
const RawgGameSearch = Schema.Struct({
  results: Schema.Struct({
    id: Schema.Finite.pipe(Schema.optional),
    name: Schema.String.pipe(Schema.optional),
    genres: Schema.Struct({ name: Schema.String }).pipe(Schema.Array, Schema.optional),
    /** RAWG's rough community-average hours to complete; often 0 or absent. */
    playtime: Schema.Finite.pipe(Schema.optional),
  }).pipe(Schema.Array, Schema.optional),
});

/** The slice of a RAWG `/games/{id}/game-series` payload used for franchises. */
const RawgSeries = Schema.Struct({
  results: Schema.Struct({ name: Schema.String }).pipe(Schema.Array, Schema.optional),
});

const searchUrl = (query: string, apiKey: string): string =>
  `${RAWG_ENDPOINT}?search=${encodeURIComponent(query)}&key=${apiKey}&page_size=1`;

const seriesUrl = (id: number, apiKey: string): string =>
  `${RAWG_ENDPOINT}/${id}/game-series?key=${apiKey}`;

const isOkStatus = (status: number): boolean => status >= 200 && status < 300;

/**
 * A captured `HttpClient` (its method requirements are already `never`, so the
 * provider's effects stay `R = never`, matching the port). Each helper recovers
 * transport/non-OK/decode failures to its own absent value and lets a genuine
 * 429 surface as `RateLimitedError`.
 */
type Client = HttpClient.HttpClient;

/**
 * The single shared `/games?search=` lookup. Both genre metadata and franchise
 * enrichment derive from the one decoded {@link GameInfo}, so a title is
 * searched once. Mirrors the previous helpers' recovery: transport/non-OK/decode
 * failures degrade to absence (`undefined`); a genuine 429 surfaces as
 * `RateLimitedError`.
 */
const searchGame = (
  client: Client,
  url: string
): Effect.Effect<GameInfo | undefined, RateLimitedError> =>
  Effect.gen(function* () {
    const response = yield* client.get(url);
    if (response.status === 429) {
      return yield* new RateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return NO_GAME;
    }
    return yield* HttpClientResponse.schemaBodyJson(RawgGameSearch)(response).pipe(
      Effect.map((body): GameInfo | undefined => {
        const first = body.results?.[0];
        if (first === undefined) {
          return NO_GAME;
        }
        return {
          id: first.id,
          name: first.name,
          genres: (first.genres ?? []).map((g) => g.name),
          playtime: first.playtime,
        };
      }),
      Effect.orElseSucceed(() => NO_GAME)
    );
  }).pipe(Effect.catchTag("HttpClientError", () => Effect.succeed(NO_GAME)));

const fetchSeriesNames = (
  client: Client,
  url: string
): Effect.Effect<ReadonlyArray<string>, RateLimitedError> =>
  Effect.gen(function* () {
    const response = yield* client.get(url);
    if (response.status === 429) {
      return yield* new RateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return NO_SERIES;
    }
    return yield* HttpClientResponse.schemaBodyJson(RawgSeries)(response).pipe(
      Effect.map((body) => (body.results ?? []).map((g) => g.name)),
      Effect.orElseSucceed(() => NO_SERIES)
    );
  }).pipe(Effect.catchTag("HttpClientError", () => Effect.succeed(NO_SERIES)));

/** The shared search cache: one decoded {@link GameInfo} per normalised title. */
type SearchCache = Ref.Ref<Map<string, GameInfo | undefined>>;

/**
 * Memoised shared search: the single `/games?search=` round-trip both lookups
 * derive from, so genre and franchise enrichment of a title search it once.
 */
const cachedSearch = (
  client: Client,
  apiKey: string,
  cache: SearchCache,
  query: string
): Effect.Effect<GameInfo | undefined, RateLimitedError> =>
  Effect.gen(function* () {
    const key = query.toLowerCase();
    const current = yield* Ref.get(cache);
    if (current.has(key)) {
      return current.get(key);
    }
    const info = yield* searchGame(client, searchUrl(query, apiKey));
    yield* Ref.update(cache, (map) => map.set(key, info));
    return info;
  });

/** Reuse the shared game-info for the id, then the separate series request. */
const resolveFranchise = (
  client: Client,
  apiKey: string,
  cache: SearchCache,
  query: string
): Effect.Effect<string | undefined, RateLimitedError> =>
  Effect.gen(function* () {
    const game = yield* cachedSearch(client, apiKey, cache, query);
    if (game?.id === undefined || game.name === undefined) {
      return NO_FRANCHISE;
    }
    const seriesNames = yield* fetchSeriesNames(client, seriesUrl(game.id, apiKey));
    return deriveFranchise([game.name, ...seriesNames]);
  });

/** Build the real (keyed) provider, closing over the client, key, and caches. */
const makeRawgProvider = (client: Client, apiKey: string): Effect.Effect<TitleEnrichmentShape> =>
  Effect.gen(function* () {
    // The shared search cache: one `/games?search=` per title, reused by both the
    // genre and franchise lookups (and across requests, since the layer is built
    // once per worker process — #214).
    const searchCache: SearchCache = yield* Ref.make(new Map());
    const franchiseCache = yield* Ref.make(new Map<string, string | undefined>());

    return {
      metadataFor: (title: string) =>
        Effect.gen(function* () {
          const query = normalizeForSearch(title);
          if (query.length === 0) {
            return ABSENT_METADATA;
          }
          const game = yield* cachedSearch(client, apiKey, searchCache, query);
          if (game === undefined) {
            return ABSENT_METADATA;
          }
          return {
            genre: mapRawgGenres([...game.genres]),
            typicalPlaytime: normalizePlaytime(game.playtime),
          };
        }),

      franchiseFor: (title: string) =>
        Effect.gen(function* () {
          const query = normalizeForSearch(title);
          if (query.length === 0) {
            return NO_FRANCHISE;
          }
          const key = query.toLowerCase();
          const cache = yield* Ref.get(franchiseCache);
          if (cache.has(key)) {
            return cache.get(key);
          }
          const franchise = yield* resolveFranchise(client, apiKey, searchCache, query);
          yield* Ref.update(franchiseCache, (current) => current.set(key, franchise));
          return franchise;
        }),
    } satisfies TitleEnrichmentShape;
  });

/** A provider that does nothing — the gate when `RAWG_API_KEY` is unset. */
const noopProvider: TitleEnrichmentShape = {
  metadataFor: () => Effect.succeed(ABSENT_METADATA),
  franchiseFor: () => Effect.succeed(NO_FRANCHISE),
};

const make = Effect.gen(function* () {
  // A malformed RAWG_API_KEY source is a deploy-time defect, not a recoverable
  // enrichment failure; `Config.option` already maps "unset" to `None`.
  const apiKey = yield* Config.string("RAWG_API_KEY").pipe(Config.option, Effect.orDie);
  if (Option.isNone(apiKey)) {
    return noopProvider;
  }
  const client = yield* HttpClient.HttpClient;
  return yield* makeRawgProvider(client, apiKey.value);
});

/**
 * The RAWG `TitleEnrichment` layer, self-contained: it brings its own
 * fetch-based `HttpClient`, so a handler only provides this one layer.
 */
export const TitleEnrichmentLayer: Layer.Layer<TitleEnrichment> = Layer.provide(
  Layer.effect(TitleEnrichment, make),
  FetchHttpClient.layer
);

/** Recover both enrichment error tags to the supplied absent value. */
const recoverAbsent = <A>(absent: A) => ({
  RateLimitedError: () => Effect.succeed(absent),
  UpstreamUnavailableError: () => Effect.succeed(absent),
});

/**
 * Run `fn` for each name at the shared lookup concurrency and collect the
 * results into a `Map` keyed by name. `Effect.forEach`'s `concurrency` already
 * caps in-flight lookups, so the prefetch builders share one batching loop.
 */
const batchLookup = <A>(
  names: ReadonlyArray<string>,
  fn: (name: string) => Effect.Effect<A>
): Effect.Effect<Map<string, A>> =>
  Effect.forEach(names, (name) => fn(name).pipe(Effect.map((value) => [name, value] as const)), {
    concurrency: RAWG_LOOKUP_CONCURRENCY,
  }).pipe(Effect.map((entries) => new Map(entries)));

/**
 * Look up genre + typical playtime for each (already keyword-filtered) title
 * name, keyed by name. Each lookup independently falls back to absence on a
 * provider failure, so the batch always resolves — the server-fn boundary never
 * throws on enrichment failure, matching today's behaviour.
 */
export const prefetchGameMetadata = (
  names: ReadonlyArray<string>
): Effect.Effect<Map<string, GameMetadata>, never, TitleEnrichment> =>
  Effect.gen(function* () {
    const provider = yield* TitleEnrichment;
    return yield* batchLookup(names, (name) =>
      provider
        .metadataFor(name)
        .pipe(Effect.catchTags(recoverAbsent<GameMetadata>(ABSENT_METADATA)))
    );
  });

/**
 * Look up a franchise for each (already keyword-filtered) title name, keyed by
 * name. Mirrors {@link prefetchGameMetadata}'s per-title fallback shape.
 */
export const prefetchFranchises = (
  names: ReadonlyArray<string>
): Effect.Effect<Map<string, string | undefined>, never, TitleEnrichment> =>
  Effect.gen(function* () {
    const provider = yield* TitleEnrichment;
    return yield* batchLookup(names, (name) =>
      provider
        .franchiseFor(name)
        .pipe(Effect.catchTags(recoverAbsent<string | undefined>(NO_FRANCHISE)))
    );
  });
