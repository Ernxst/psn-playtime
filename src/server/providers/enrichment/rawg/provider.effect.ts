/**
 * RAWG-backed implementation of the `EnrichmentProvider` port (phase E4).
 *
 * Behaviour mirrors the previous `rawg.ts` lookups exactly:
 * - The `RAWG_API_KEY` gate is modelled as the layer resolving to a no-op
 *   provider (every lookup is a successful absence) when the key is unset, so
 *   callers fall back to their keyword result and the network is never touched.
 * - A transport error, a non-OK response, or a body that fails schema
 *   validation all recover to the success-absent value — today's fallback.
 * - A genuine HTTP 429 is surfaced as `ProviderRateLimitedError`; the prefetch
 *   builders recover it (and `ProviderUnavailableError`) back to absence, so the
 *   server-fn boundary still never throws on enrichment failure.
 *
 * Networking goes through `@effect/platform`'s fetch-based `HttpClient` (it lives
 * in core `effect/unstable/http` for the v4 beta line; `@effect/platform@4` is
 * not published). `FetchHttpClient.layer` uses `globalThis.fetch`, so it runs on
 * the Nitro/Cloudflare-Workers runtime as well as in Node/tests. The
 * request-scoped lookup cache is a `Ref<Map>` built per layer construction
 * (i.e. per `Effect.provide` at the handler boundary), replacing the Map that
 * `rawg.ts` used to receive by argument.
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
  EnrichmentProvider,
  type EnrichmentProviderShape,
  type GameMetadata,
} from "@/server/providers/enrichment/contract.effect";
import {
  deriveFranchise,
  mapRawgGenres,
  normalizeForSearch,
  normalizePlaytime,
} from "@/server/providers/enrichment/rawg/client";
import { ProviderRateLimitedError } from "@/server/providers/errors.effect";

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";

/** Max RAWG lookups in flight at once, matching the previous batch size. */
const RAWG_LOOKUP_CONCURRENCY = 8;

/** A successful "no usable data" result — the caller keeps its keyword fallback. */
const ABSENT_METADATA: GameMetadata = {};

type GameMatch = { readonly id: number; readonly name: string };

/** Typed absences, named so they read as values rather than `Effect.void`. */
const NO_MATCH: GameMatch | undefined = undefined;
const NO_FRANCHISE: string | undefined = undefined;
const NO_SERIES: ReadonlyArray<string> = [];

/** The slice of the RAWG `/games` search payload a metadata lookup relies on. */
const RawgGameSearch = Schema.Struct({
  results: Schema.Struct({
    genres: Schema.Struct({ name: Schema.String }).pipe(Schema.Array, Schema.optional),
    /** RAWG's rough community-average hours to complete; often 0 or absent. */
    playtime: Schema.Finite.pipe(Schema.optional),
  }).pipe(Schema.Array, Schema.optional),
});

/** The RAWG search slice used to locate a game's id for a series lookup. */
const RawgGameMatch = Schema.Struct({
  results: Schema.Struct({ id: Schema.Finite, name: Schema.String }).pipe(
    Schema.Array,
    Schema.optional
  ),
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
 * 429 surface as `ProviderRateLimitedError`.
 */
type Client = HttpClient.HttpClient;

const fetchGameMetadata = (
  client: Client,
  url: string
): Effect.Effect<GameMetadata, ProviderRateLimitedError> =>
  Effect.gen(function* () {
    const response = yield* client.get(url);
    if (response.status === 429) {
      return yield* new ProviderRateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return ABSENT_METADATA;
    }
    return yield* HttpClientResponse.schemaBodyJson(RawgGameSearch)(response).pipe(
      Effect.map((body) => {
        const first = body.results?.[0];
        return {
          genre: mapRawgGenres((first?.genres ?? []).map((g) => g.name)),
          typicalPlaytime: normalizePlaytime(first?.playtime),
        };
      }),
      Effect.orElseSucceed(() => ABSENT_METADATA)
    );
  }).pipe(Effect.catchTag("HttpClientError", () => Effect.succeed(ABSENT_METADATA)));

const fetchGameMatch = (
  client: Client,
  url: string
): Effect.Effect<GameMatch | undefined, ProviderRateLimitedError> =>
  Effect.gen(function* () {
    const response = yield* client.get(url);
    if (response.status === 429) {
      return yield* new ProviderRateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return NO_MATCH;
    }
    return yield* HttpClientResponse.schemaBodyJson(RawgGameMatch)(response).pipe(
      Effect.map((body) => body.results?.[0]),
      Effect.orElseSucceed(() => NO_MATCH)
    );
  }).pipe(Effect.catchTag("HttpClientError", () => Effect.succeed(NO_MATCH)));

const fetchSeriesNames = (
  client: Client,
  url: string
): Effect.Effect<ReadonlyArray<string>, ProviderRateLimitedError> =>
  Effect.gen(function* () {
    const response = yield* client.get(url);
    if (response.status === 429) {
      return yield* new ProviderRateLimitedError({ provider: "rawg" });
    }
    if (!isOkStatus(response.status)) {
      return NO_SERIES;
    }
    return yield* HttpClientResponse.schemaBodyJson(RawgSeries)(response).pipe(
      Effect.map((body) => (body.results ?? []).map((g) => g.name)),
      Effect.orElseSucceed(() => NO_SERIES)
    );
  }).pipe(Effect.catchTag("HttpClientError", () => Effect.succeed(NO_SERIES)));

const fetchFranchise = (
  client: Client,
  query: string,
  apiKey: string
): Effect.Effect<string | undefined, ProviderRateLimitedError> =>
  Effect.gen(function* () {
    const game = yield* fetchGameMatch(client, searchUrl(query, apiKey));
    if (game === undefined) {
      return undefined;
    }
    const seriesNames = yield* fetchSeriesNames(client, seriesUrl(game.id, apiKey));
    return deriveFranchise([game.name, ...seriesNames]);
  });

/** Build the real (keyed) provider, closing over the client, key, and caches. */
const makeRawgProvider = (client: Client, apiKey: string): Effect.Effect<EnrichmentProviderShape> =>
  Effect.gen(function* () {
    const metadataCache = yield* Ref.make(new Map<string, GameMetadata>());
    const franchiseCache = yield* Ref.make(new Map<string, string | undefined>());

    return {
      fetchGameMetadata: (title: string) =>
        Effect.gen(function* () {
          const query = normalizeForSearch(title);
          if (query.length === 0) {
            return ABSENT_METADATA;
          }
          const key = query.toLowerCase();
          const cached = (yield* Ref.get(metadataCache)).get(key);
          if (cached !== undefined) {
            return cached;
          }
          const result = yield* fetchGameMetadata(client, searchUrl(query, apiKey));
          yield* Ref.update(metadataCache, (cache) => cache.set(key, result));
          return result;
        }),

      fetchFranchise: (title: string) =>
        Effect.gen(function* () {
          const query = normalizeForSearch(title);
          if (query.length === 0) {
            return undefined;
          }
          const key = query.toLowerCase();
          const cache = yield* Ref.get(franchiseCache);
          if (cache.has(key)) {
            return cache.get(key);
          }
          const franchise = yield* fetchFranchise(client, query, apiKey);
          yield* Ref.update(franchiseCache, (current) => current.set(key, franchise));
          return franchise;
        }),
    } satisfies EnrichmentProviderShape;
  });

/** A provider that does nothing — the gate when `RAWG_API_KEY` is unset. */
const noopProvider: EnrichmentProviderShape = {
  fetchGameMetadata: () => Effect.succeed(ABSENT_METADATA),
  fetchFranchise: () => Effect.succeed(NO_FRANCHISE),
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
 * The RAWG `EnrichmentProvider` layer, self-contained: it brings its own
 * fetch-based `HttpClient`, so a handler only provides this one layer.
 */
export const EnrichmentProviderLayer: Layer.Layer<EnrichmentProvider> = Layer.provide(
  Layer.effect(EnrichmentProvider, make),
  FetchHttpClient.layer
);

/** Recover both enrichment error tags to the supplied absent value. */
const recoverAbsent = <A>(absent: A) => ({
  ProviderRateLimitedError: () => Effect.succeed(absent),
  ProviderUnavailableError: () => Effect.succeed(absent),
});

/**
 * Look up genre + typical playtime for each (already keyword-filtered) title
 * name, keyed by name. Each lookup independently falls back to absence on a
 * provider failure, so the batch always resolves — the server-fn boundary never
 * throws on enrichment failure, matching today's behaviour.
 */
export const prefetchGameMetadata = (
  names: ReadonlyArray<string>
): Effect.Effect<Map<string, GameMetadata>, never, EnrichmentProvider> =>
  Effect.gen(function* () {
    const provider = yield* EnrichmentProvider;
    const entries = yield* Effect.forEach(
      names,
      (name) =>
        provider.fetchGameMetadata(name).pipe(
          Effect.catchTags(recoverAbsent<GameMetadata>(ABSENT_METADATA)),
          Effect.map((metadata) => [name, metadata] as const)
        ),
      { concurrency: RAWG_LOOKUP_CONCURRENCY }
    );
    return new Map(entries);
  });

/**
 * Look up a franchise for each (already keyword-filtered) title name, keyed by
 * name. Mirrors {@link prefetchGameMetadata}'s per-title fallback shape.
 */
export const prefetchFranchises = (
  names: ReadonlyArray<string>
): Effect.Effect<Map<string, string | undefined>, never, EnrichmentProvider> =>
  Effect.gen(function* () {
    const provider = yield* EnrichmentProvider;
    const entries = yield* Effect.forEach(
      names,
      (name) =>
        provider.fetchFranchise(name).pipe(
          Effect.catchTags(recoverAbsent<string | undefined>(NO_FRANCHISE)),
          Effect.map((franchise) => [name, franchise] as const)
        ),
      { concurrency: RAWG_LOOKUP_CONCURRENCY }
    );
    return new Map(entries);
  });
