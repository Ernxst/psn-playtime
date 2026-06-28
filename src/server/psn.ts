/**
 * Server data layer. Fetches a single PlayStation account's play-time from PSN
 * and normalizes everything into the `DashboardData` contract.
 *
 * The actual PSN fetch + normalization now lives behind the platform-agnostic
 * `AccountProvider` port, implemented by `PsnAccountProviderLayer`
 * (`@/server/psn.effect`); this module only wraps it (and the RAWG enrichment
 * lookups) in `createServerFn` handlers.
 *
 * The npsso token is used transiently to fetch an account once; it is never
 * stored server-side. The derived `DashboardData` is cached client-side
 * (`@/lib/dashboard-store`), which is the source for revisits.
 */
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { z } from "zod";
import { runServer } from "@/integrations/effect/runtime.effect";
import { enrichTitle } from "@/lib/psn/enrich";
import type { DashboardData, Genre } from "@/lib/psn/types";
import { AccountProvider } from "@/server/ports/account-provider.effect";
import { PsnAccountProviderLayer } from "@/server/psn.effect";
import {
  EnrichmentProviderLayer,
  prefetchFranchises,
  prefetchGameMetadata,
} from "@/server/rawg.effect";

const signInInput = z.object({
  npsso: z.string().trim().min(1, "Paste your npsso token first."),
});

/**
 * Fetch and normalize one account from a transient npsso token. The token is
 * never stored server-side; the caller persists the returned `DashboardData` in
 * the client cache. Runs the PSN `AccountProvider` via the server runtime, and
 * throws a friendly error when the token is rejected (or any fetch fails),
 * exactly as before.
 */
export async function signInWithTokenHandler(
  data: z.infer<typeof signInInput>
): Promise<DashboardData> {
  try {
    return await runServer(
      Effect.gen(function* () {
        const provider = yield* AccountProvider;
        return yield* provider.fetchSnapshot(Redacted.make(data.npsso));
      }).pipe(Effect.provide(PsnAccountProviderLayer))
    );
  } catch {
    throw new Error(
      "That token didn't work — it may be expired. Grab a fresh npsso and try again."
    );
  }
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

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) => signInWithTokenHandler(data));

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(
    async ({
      data,
    }): Promise<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> => {
      const names = rawgLookupNames(data.titles, (enriched) => enriched.genre === "Other");
      const metadata = await runServer(
        prefetchGameMetadata(names).pipe(Effect.provide(EnrichmentProviderLayer))
      );
      return data.titles.flatMap((title) => {
        const info = metadata.get(title.name);
        const genre = info?.genre;
        const typicalPlaytime = info?.typicalPlaytime;
        if (!genre && typicalPlaytime === undefined) return [];
        return [
          {
            titleId: title.titleId,
            ...(genre && { genre }),
            ...(typicalPlaytime !== undefined && { typicalPlaytime }),
          },
        ];
      });
    }
  );

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(async ({ data }): Promise<Array<{ titleId: string; franchise: string }>> => {
    const names = rawgLookupNames(data.titles, (enriched) => enriched.franchise === undefined);
    const rawgFranchises = await runServer(
      prefetchFranchises(names).pipe(Effect.provide(EnrichmentProviderLayer))
    );
    return data.titles.flatMap((title) => {
      const franchise = rawgFranchises.get(title.name);
      return franchise ? [{ titleId: title.titleId, franchise }] : [];
    });
  });
