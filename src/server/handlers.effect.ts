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
import { z } from "zod";
import { runServer } from "@/integrations/effect/runtime.effect";
import { enrichTitle } from "@/lib/psn/enrich";
import type { DashboardData, Genre } from "@/lib/psn/types";
import { AccountProvider, type AccountCredential } from "@/server/ports/account-provider.effect";
import type { AccountProviderError } from "@/server/ports/errors.effect";
import { PsnAccountProviderLayer } from "@/server/psn/psn-account-provider.effect";
import {
  EnrichmentProviderLayer,
  prefetchFranchises,
  prefetchGameMetadata,
} from "@/server/rawg.effect";

const signInInput = z.object({
  npsso: z.string().trim().min(1, "Paste your npsso token first."),
});

/**
 * Fetch and normalize one account from a transient credential. Runs the PSN
 * `AccountProvider`, which is provided here as the entry-point layer.
 */
const signInEffect = (
  credential: AccountCredential
): Effect.Effect<DashboardData, AccountProviderError> =>
  Effect.flatMap(AccountProvider, (provider) => provider.fetchSnapshot(credential)).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(PsnAccountProviderLayer)
  );

/**
 * Fetch and normalize one account from a transient npsso token. The token is
 * never stored server-side; the caller persists the returned `DashboardData` in
 * the client cache. Throws a friendly error when the token is rejected (or any
 * fetch fails), exactly as before.
 */
export function signInWithTokenHandler(data: z.infer<typeof signInInput>): Promise<DashboardData> {
  const credential = Redacted.make(data.npsso);
  return credential.pipe(signInEffect, runServer).catch(() => {
    throw new Error(
      "That token didn't work — it may be expired. Grab a fresh npsso and try again."
    );
  });
}

const rawgGenreInput = z.object({
  titles: z.array(
    z.object({
      titleId: z.string(),
      name: z.string(),
      category: z.string().optional(),
    })
  ),
});

type RawgInputTitle = z.infer<typeof rawgGenreInput>["titles"][number];

/**
 * The unique title names a RAWG lookup should run for: keyword rules are the
 * fast path, so only titles they leave matching `needsLookup` (and that aren't
 * apps) fall through. Mirrors the previous prefetch filtering exactly.
 */
function rawgLookupNames(
  titles: Array<{ name: string; category?: string }>,
  needsLookup: (enriched: ReturnType<typeof enrichTitle>) => boolean
): string[] {
  const names = new Set<string>();
  for (const title of titles) {
    const enriched = enrichTitle(title.name, title.category);
    if (!enriched.isApp && needsLookup(enriched)) names.add(title.name);
  }
  return Array.from(names);
}

/** Run the RAWG genre/playtime lookup, providing the enrichment layer per request. */
const rawgGenresEffect = (
  titles: RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> =>
  prefetchGameMetadata(rawgLookupNames(titles, (enriched) => enriched.genre === "Other")).pipe(
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
  titles: RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; franchise: string }>> =>
  prefetchFranchises(rawgLookupNames(titles, (enriched) => enriched.franchise === undefined)).pipe(
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
