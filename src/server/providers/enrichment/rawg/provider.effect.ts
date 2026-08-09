/**
 * RAWG-backed implementation of the `TitleEnrichment` capability.
 *
 * - The `RAWG_API_KEY` gate resolves the layer to an explicitly unconfigured
 *   provider when the key is unset, so callers can disclose the unavailable
 *   metadata instead of treating blank results as complete.
 * - Absence (`NO_GAME` / `{}`) is reserved for a genuine "no usable RAWG match":
 *   a successful search whose results array is empty. Infrastructure failures are
 *   NOT folded into absence — a transport error, a non-OK response, or a body
 *   that fails schema validation is classified onto the typed error channel so a
 *   caller can tell "RAWG found nothing" from "RAWG is down".
 * - A genuine HTTP 429 surfaces as `RateLimitedError`; every other non-OK status,
 *   transport `HttpClientError`, and schema decode failure surface as
 *   `UpstreamUnavailableError`. The prefetch builders preserve those failures as
 *   batch evidence so the server-fn boundary can return a truthful failed or
 *   partial outcome without throwing.
 *
 * Networking goes through the fetch-based `HttpClient` (`effect/unstable/http`);
 * `FetchHttpClient.layer` uses `globalThis.fetch`, so it runs on the
 * Nitro/Cloudflare-Workers runtime as well as in Node/tests. The shared
 * `/games?search=` lookup is an Effect `Cache` (`effect/Cache`); the franchise
 * result is another Effect `Cache`. Both are built once per layer construction;
 * `TitleEnrichmentLayer` is folded into `serverRuntime` (`runtime.effect.ts`),
 * so they live for the worker process and hit across requests. The search
 * `Cache` natively coalesces concurrent misses for the same key into a single
 * in-flight lookup, so the genre and franchise queries the dashboard starts
 * independently share one round-trip rather than racing two. RAWG metadata is
 * effectively static, so usable matches are kept for the process lifetime;
 * failures and unresolved/no-match results are evicted immediately so retry can
 * re-check incomplete metadata (see {@link makeRawgProvider}).
 */
import * as Cache from "effect/Cache";
import * as Config from "effect/Config";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  TitleEnrichment,
  type FranchiseMatch,
  type TitleEnrichmentShape,
  type GameMetadata,
  type GameMetadataMatch,
} from "@/server/providers/enrichment/contract.effect";
import {
  deriveFranchise,
  mapRawgGenres,
  normalizeForSearch,
  normalizePlaytime,
} from "@/server/providers/enrichment/rawg/client";
import {
  RateLimitedError,
  type TitleEnrichmentError,
  UpstreamUnavailableError,
  providerError,
} from "@/server/providers/errors.effect";

/**
 * The RAWG API origin. The Layer owns it: it's prepended onto every request the
 * captured client issues (see {@link make}), so the lookup helpers address RAWG
 * by relative path only and never carry the origin themselves.
 */
const RAWG_BASE_URL = "https://api.rawg.io/api";

/** The `/games` collection path, relative to {@link RAWG_BASE_URL}. */
const GAMES_PATH = "/games";

/** Max RAWG lookups in flight at once. */
const RAWG_LOOKUP_CONCURRENCY = 8;

/** Bound one complete RAWG response, including its JSON decode. */
const RAWG_REQUEST_TIMEOUT = Duration.seconds(2);

/**
 * Bound on distinct normalised titles the search `Cache` retains. RAWG metadata
 * is static so entries never go stale, but a `Cache` requires a capacity; this
 * is comfortably above the distinct titles a single worker sees.
 */
const RAWG_SEARCH_CACHE_CAPACITY = 4096;

/**
 * How long a usable search result is retained. Infrastructure failures and
 * unresolved results get {@link Duration.zero} so retry can re-check them.
 */
const RAWG_SEARCH_TTL = Duration.infinity;

/** A title match with no usable genre or playtime fields. */
const ABSENT_METADATA: GameMetadata = {};

/** RAWG returned no game for the title. */
const NO_METADATA_MATCH: GameMetadataMatch = { matched: false, metadata: ABSENT_METADATA };

/** RAWG returned no game for the title, so no franchise decision was possible. */
const NO_FRANCHISE_MATCH: FranchiseMatch = { matched: false };

/**
 * Everything a single `/games?search=` round-trip yields that either lookup
 * needs: `id`/`name` for the series request, `genres`/`playtime` for metadata.
 * One decode serves both so genre and franchise enrichment share one search.
 */
type GameInfo = {
  readonly id: number;
  readonly name: string;
  readonly genres: ReadonlyArray<string>;
  readonly playtime: number | undefined;
};

/** Typed search absence, named so it reads as a value rather than `Effect.void`. */
const NO_GAME: GameInfo | undefined = undefined;

/**
 * The slice of the RAWG `/games` search payload both lookups share. `id`/`name`
 * are required because a result without stable identity is an invalid/blank
 * provider response, not evidence that no game matched.
 */
const RawgGameSearch = Schema.Struct({
  results: Schema.Struct({
    id: Schema.Finite,
    name: Schema.NonEmptyString,
    genres: Schema.Struct({ name: Schema.NonEmptyString }).pipe(Schema.Array),
    /** RAWG's rough community-average hours to complete; often 0 or absent. */
    playtime: Schema.Finite.pipe(Schema.optional),
  }).pipe(Schema.Array),
});

/** The slice of a RAWG `/games/{id}/game-series` payload used for franchises. */
const RawgSeries = Schema.Struct({
  results: Schema.Struct({ name: Schema.NonEmptyString }).pipe(Schema.Array),
});

/**
 * The RAWG API key, kept inside a `Redacted` so it never logs or stringifies as
 * plain text. It's unwrapped via `Redacted.value` only where a request URL is
 * constructed (see {@link searchGame}/{@link fetchSeriesNames}), never stored or
 * carried on a typed error.
 */
type ApiKey = Redacted.Redacted<string>;

const isOkStatus = (status: number): boolean => status >= 200 && status < 300;

/**
 * A captured `HttpClient` (its method requirements are already `never`, so the
 * provider's effects stay `R = never`, matching the port). Each helper returns
 * absence only for a genuine empty result and classifies every infrastructure
 * failure onto the typed channel: HTTP 429 → `RateLimitedError`; other non-OK
 * statuses, transport `HttpClientError`, and schema decode failures →
 * `UpstreamUnavailableError`.
 */
type Client = HttpClient.HttpClient;

/**
 * Classify a transport or decode failure onto the typed channel without leaking
 * upstream text: `providerError` inspects the thrown value locally and discards
 * it, returning a sanitised `RateLimitedError`/`UpstreamUnavailableError`. Shared
 * by both lookups for `HttpClientError` (transport) and `SchemaError` (decode).
 */
const classifyRawgFailure = providerError("rawg");

/**
 * The single shared `/games?search=` lookup. Both genre metadata and franchise
 * enrichment derive from the one decoded {@link GameInfo}, so a title is
 * searched once. Absence (`NO_GAME`) is returned only for a genuine empty result;
 * a 429 surfaces as `RateLimitedError`, and every other non-OK status, transport
 * failure, or decode failure as `UpstreamUnavailableError`.
 */
const searchGame = (
  client: Client,
  query: string,
  apiKey: ApiKey
): Effect.Effect<GameInfo | undefined, TitleEnrichmentError> =>
  Effect.gen(function* () {
    const response = yield* client.get(GAMES_PATH, {
      urlParams: { search: query, key: Redacted.value(apiKey), page_size: 1 },
    });
    if (response.status === 429) {
      return yield* new RateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return yield* new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" });
    }
    const body = yield* HttpClientResponse.schemaBodyJson(RawgGameSearch)(response);
    const first = body.results[0];
    if (first === undefined) {
      return NO_GAME;
    }
    return {
      id: first.id,
      name: first.name,
      genres: first.genres.map((g) => g.name),
      playtime: first.playtime,
    };
  }).pipe(
    Effect.timeoutOrElse({
      duration: RAWG_REQUEST_TIMEOUT,
      orElse: () =>
        Effect.fail(new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" })),
    }),
    Effect.catchTags({
      HttpClientError: classifyRawgFailure,
      SchemaError: classifyRawgFailure,
    })
  );

const fetchSeriesNames = (
  client: Client,
  id: number,
  apiKey: ApiKey
): Effect.Effect<ReadonlyArray<string>, TitleEnrichmentError> =>
  Effect.gen(function* () {
    const response = yield* client.get(`${GAMES_PATH}/${id}/game-series`, {
      urlParams: { key: Redacted.value(apiKey) },
    });
    if (response.status === 429) {
      return yield* new RateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return yield* new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" });
    }
    const body = yield* HttpClientResponse.schemaBodyJson(RawgSeries)(response);
    return body.results.map((g) => g.name);
  }).pipe(
    Effect.timeoutOrElse({
      duration: RAWG_REQUEST_TIMEOUT,
      orElse: () =>
        Effect.fail(new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" })),
    }),
    Effect.catchTags({
      HttpClientError: classifyRawgFailure,
      SchemaError: classifyRawgFailure,
    })
  );

/**
 * The shared search cache: one decoded {@link GameInfo} per normalised title.
 * An Effect `Cache` whose `lookup` is the single {@link searchGame} round-trip,
 * keyed by the normalised query. Concurrent misses for the same key coalesce
 * onto one in-flight lookup, so the dashboard's independent genre and franchise
 * queries share a single `/games?search=` request rather than racing two.
 */
type SearchCache = Cache.Cache<string, GameInfo | undefined, TitleEnrichmentError>;

/**
 * Build the shared search `Cache`. The lookup is the single {@link searchGame}
 * round-trip, keyed by the normalised query; the `Cache` coalesces concurrent
 * misses for a key onto one in-flight lookup (the dedup) and bounds entries by
 * {@link RAWG_SEARCH_CACHE_CAPACITY}.
 *
 * `timeToLive` keeps only a match with a recognised genre. Failed, no-match,
 * and blank/unmapped metadata exits get `Duration.zero`, so an incomplete title
 * can actually be checked again by the client retry path.
 */
const makeSearchCache = (client: Client, apiKey: ApiKey): Effect.Effect<SearchCache> =>
  Cache.makeWith((query: string) => searchGame(client, query, apiKey), {
    capacity: RAWG_SEARCH_CACHE_CAPACITY,
    timeToLive: (exit) =>
      Exit.isSuccess(exit) &&
      exit.value !== undefined &&
      mapRawgGenres([...exit.value.genres]) !== undefined
        ? RAWG_SEARCH_TTL
        : Duration.zero,
  });

/** Reuse the shared game-info for the id, then the separate series request. */
const resolveFranchise = (
  client: Client,
  apiKey: ApiKey,
  cache: SearchCache,
  query: string
): Effect.Effect<FranchiseMatch, TitleEnrichmentError> =>
  Effect.gen(function* () {
    const game = yield* Cache.get(cache, query);
    if (game === undefined) {
      return NO_FRANCHISE_MATCH;
    }
    const seriesNames = yield* fetchSeriesNames(client, game.id, apiKey);
    const franchise = deriveFranchise([game.name, ...seriesNames]);
    return franchise === undefined ? { matched: true } : { matched: true, franchise };
  });

type FranchiseCache = Cache.Cache<string, FranchiseMatch, TitleEnrichmentError>;

/** Cache confirmed matches, but never freeze a no-match or provider failure. */
const makeFranchiseCache = (
  client: Client,
  apiKey: ApiKey,
  searchCache: SearchCache
): Effect.Effect<FranchiseCache> =>
  Cache.makeWith((query: string) => resolveFranchise(client, apiKey, searchCache, query), {
    capacity: RAWG_SEARCH_CACHE_CAPACITY,
    timeToLive: (exit) =>
      Exit.isSuccess(exit) && exit.value.matched ? RAWG_SEARCH_TTL : Duration.zero,
  });

/** Build the real (keyed) provider, closing over the client, key, and caches. */
const makeRawgProvider = (client: Client, apiKey: ApiKey): Effect.Effect<TitleEnrichmentShape> =>
  Effect.gen(function* () {
    // The shared search cache (one `/games?search=` per title, reused by both the
    // genre and franchise lookups and across requests) and the franchise-result
    // cache, built once per worker process.
    const searchCache = yield* makeSearchCache(client, apiKey);
    const franchiseCache = yield* makeFranchiseCache(client, apiKey, searchCache);

    const metadataFor = Effect.fn("RawgTitleEnrichment.metadataFor")(function* (title: string) {
      const query = normalizeForSearch(title);
      if (query.length === 0) {
        return NO_METADATA_MATCH;
      }
      const game = yield* Cache.get(searchCache, query);
      if (game === undefined) {
        return NO_METADATA_MATCH;
      }
      const genre = mapRawgGenres([...game.genres]);
      const typicalPlaytime = normalizePlaytime(game.playtime);
      return {
        matched: true,
        metadata: {
          ...(genre !== undefined && { genre }),
          ...(typicalPlaytime !== undefined && { typicalPlaytime }),
        },
      } satisfies GameMetadataMatch;
    });

    const franchiseFor = Effect.fn("RawgTitleEnrichment.franchiseFor")(function* (title: string) {
      const query = normalizeForSearch(title);
      if (query.length === 0) {
        return NO_FRANCHISE_MATCH;
      }
      return yield* Cache.get(franchiseCache, query);
    });

    return {
      availability: "available",
      metadataFor,
      franchiseFor,
    } satisfies TitleEnrichmentShape;
  });

/** An explicitly unavailable provider — the gate when `RAWG_API_KEY` is unset. */
const noopProvider: TitleEnrichmentShape = {
  availability: "unconfigured",
  metadataFor: () => Effect.succeed(NO_METADATA_MATCH),
  franchiseFor: () => Effect.succeed(NO_FRANCHISE_MATCH),
};

const make = Effect.gen(function* () {
  // A malformed RAWG_API_KEY source is a deploy-time defect, not a recoverable
  // enrichment failure; `Config.option` already maps "unset" to `None`. The key
  // stays inside a `Redacted` so it never logs as plain text; it's unwrapped
  // only where a request URL is built.
  const apiKey = yield* Config.redacted("RAWG_API_KEY").pipe(Config.option, Effect.orDie);
  if (Option.isNone(apiKey)) {
    return noopProvider;
  }
  // The Layer owns the base URL: every request the captured client issues is
  // prefixed with the RAWG origin, so the lookup helpers address it by relative
  // path only.
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(RAWG_BASE_URL))
  );
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

interface BatchLookupResult<A> {
  readonly values: Map<string, A>;
  readonly failures: number;
}

type LookupAttempt<A> =
  | { readonly _tag: "Success"; readonly name: string; readonly value: A }
  | { readonly _tag: "Failure"; readonly name: string };

/**
 * Run `fn` for each name at the shared lookup concurrency and collect the
 * results into a `Map` keyed by name. `Effect.forEach`'s `concurrency` already
 * caps in-flight lookups, so the prefetch builders share one batching loop.
 */
const batchLookup = <A>(
  names: ReadonlyArray<string>,
  fn: (name: string) => Effect.Effect<A, TitleEnrichmentError>
): Effect.Effect<BatchLookupResult<A>> =>
  Effect.forEach(
    names,
    (name) =>
      fn(name).pipe(
        Effect.match({
          onFailure: (): LookupAttempt<A> => ({ _tag: "Failure", name }),
          onSuccess: (value): LookupAttempt<A> => ({ _tag: "Success", name, value }),
        })
      ),
    { concurrency: RAWG_LOOKUP_CONCURRENCY }
  ).pipe(
    Effect.map((attempts) => {
      const values = new Map<string, A>();
      let failures = 0;
      for (const attempt of attempts) {
        if (attempt._tag === "Success") values.set(attempt.name, attempt.value);
        else failures += 1;
      }
      return { values, failures };
    })
  );

export interface EnrichmentPrefetch<A> extends BatchLookupResult<A> {
  readonly availability: TitleEnrichmentShape["availability"];
}

/**
 * Look up genre + typical playtime for each (already keyword-filtered) title
 * name, keyed by name. Expected provider failures stay visible in `failures`,
 * while the effect itself remains non-failing for the server-fn boundary.
 */
export const prefetchGameMetadata = (
  names: ReadonlyArray<string>
): Effect.Effect<EnrichmentPrefetch<GameMetadataMatch>, never, TitleEnrichment> =>
  Effect.gen(function* () {
    const provider = yield* TitleEnrichment;
    if (provider.availability === "unconfigured") {
      return { availability: provider.availability, values: new Map(), failures: 0 };
    }
    const result = yield* batchLookup(names, provider.metadataFor);
    return { availability: provider.availability, ...result };
  });

/**
 * Look up a franchise for each (already keyword-filtered) title name, keyed by
 * name. Mirrors {@link prefetchGameMetadata}'s per-title fallback shape.
 */
export const prefetchFranchises = (
  names: ReadonlyArray<string>
): Effect.Effect<EnrichmentPrefetch<FranchiseMatch>, never, TitleEnrichment> =>
  Effect.gen(function* () {
    const provider = yield* TitleEnrichment;
    if (provider.availability === "unconfigured") {
      return { availability: provider.availability, values: new Map(), failures: 0 };
    }
    const result = yield* batchLookup(names, provider.franchiseFor);
    return { availability: provider.availability, ...result };
  });
