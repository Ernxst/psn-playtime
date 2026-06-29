/**
 * Server data layer. Fetches a single PlayStation account's play-time from PSN
 * and normalizes everything into the `DashboardData` contract.
 *
 * The actual PSN fetch + normalization lives behind the platform-agnostic
 * `AccountProvider` port, implemented by `PsnAccountProviderLayer`
 * (`@/server/psn/psn-account-provider.effect`); this module only wraps it (and
 * the RAWG enrichment lookups) in `createServerFn` handlers.
 *
 * These handlers are the application entry points, so each composes its own
 * layer and provides it here (the `strictEffectProvide` diagnostic — which
 * reserves Layer provides for entry points — is disabled per-line for exactly
 * these provides). The npsso token is used transiently to fetch an account
 * once; it is never stored server-side. The derived `DashboardData` is cached
 * client-side (`@/lib/dashboard-store`), which is the source for revisits.
 */
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { DashboardData, type Genre } from "@/lib/psn/contract.schema";
import { runServer } from "@/runtime/runtime.effect";
import { AccountProvider, type AccountCredential } from "@/server/ports/account-provider.effect";
import { PsnAccountProviderLayer } from "@/server/psn/psn-account-provider.effect";
import {
  EnrichmentProviderLayer,
  prefetchFranchises,
  prefetchGameMetadata,
} from "@/server/rawg.effect";

const SignInInput = Schema.Struct({
  npsso: Schema.Trim.check(Schema.isNonEmpty()),
});
const signInInput = Schema.toStandardSchemaV1(SignInInput);

/** Validates the provider's snapshot against the `DashboardData` contract before it crosses the server-fn boundary. */
const decodeDashboard = Schema.decodeUnknownEffect(DashboardData);

/**
 * Fetch and normalize one account from a transient credential. Runs the PSN
 * `AccountProvider`, which is provided here as the entry-point layer, then
 * decodes the snapshot against the `DashboardData` contract before it goes over
 * the wire (a pass-through for valid data).
 */
const signInEffect = (credential: AccountCredential) =>
  Effect.flatMap(AccountProvider, (provider) => provider.fetchSnapshot(credential)).pipe(
    Effect.flatMap(decodeDashboard),
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(PsnAccountProviderLayer)
  );

/**
 * Fetch and normalize one account from a transient npsso token. The token is
 * never stored server-side; the caller persists the returned `DashboardData` in
 * the client cache. Throws a friendly error when the token is rejected (or any
 * fetch fails), exactly as before.
 */
export function signInWithTokenHandler(
  data: Schema.Schema.Type<typeof SignInInput>
): Promise<DashboardData> {
  const credential = Redacted.make(data.npsso);
  return credential.pipe(signInEffect, runServer).catch(() => {
    throw new Error(
      "That token didn't work — it may be expired. Grab a fresh npsso and try again."
    );
  });
}

const RawgGenreInput = Schema.Struct({
  titles: Schema.Array(
    Schema.Struct({
      titleId: Schema.String,
      name: Schema.String,
      category: Schema.optional(Schema.String),
    })
  ),
});
const rawgGenreInput = Schema.toStandardSchemaV1(RawgGenreInput);

type RawgInputTitle = Schema.Schema.Type<typeof RawgGenreInput>["titles"][number];

/**
 * The unique title names a RAWG lookup should run for. RAWG is the sole
 * enrichment source and apps are already excluded from the snapshot's games, so
 * every game needs a lookup — just dedupe by name.
 */
function rawgLookupNames(titles: ReadonlyArray<{ name: string }>): string[] {
  return Array.from(new Set(titles.map((title) => title.name)));
}

/** Run the RAWG genre/playtime lookup, providing the enrichment layer per request. */
const rawgGenresEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> =>
  prefetchGameMetadata(rawgLookupNames(titles)).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(EnrichmentProviderLayer),
    Effect.map((metadata) =>
      titles.flatMap((title) => {
        const info = metadata.get(title.name);
        const genre = info?.genre;
        const typicalPlaytime = info?.typicalPlaytime;
        if (genre === undefined && typicalPlaytime === undefined) return [];
        return [
          {
            titleId: title.titleId,
            ...(genre && { genre }),
            ...(typicalPlaytime !== undefined && { typicalPlaytime }),
          },
        ];
      })
    )
  );

/** Run the RAWG franchise lookup, providing the enrichment layer per request. */
const rawgFranchisesEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; franchise: string }>> =>
  prefetchFranchises(rawgLookupNames(titles)).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(EnrichmentProviderLayer),
    Effect.map((rawgFranchises) =>
      titles.flatMap((title) => {
        const franchise = rawgFranchises.get(title.name);
        return franchise !== undefined && franchise !== ""
          ? [{ titleId: title.titleId, franchise }]
          : [];
      })
    )
  );

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) => signInWithTokenHandler(data));

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgGenresEffect(data.titles)));

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgFranchisesEffect(data.titles)));
