/**
 * PSN-backed implementation of the `DashboardSource` capability: authenticate an
 * npsso credential, fetch the profile, played games, and trophies, and normalize
 * them into the un-enriched `DashboardData` contract.
 *
 * - The authenticated session is the `PsnSession` `Context.Service`
 *   (`./session.effect`): it performs the npsso→token exchange once and captures
 *   `auth`, so `auth` is not threaded through this module.
 * - The pure normalization/name-matching helpers live in `./normalize`.
 * - `buildSnapshot` reads `PsnSession`, fetches the three session effects in
 *   parallel (a trophy failure degrades to `[]`), stamps `fetchedAt`, and
 *   assembles the contract. `loadDashboard` acquires a per-request `PsnSession`
 *   from the credential and provides it to `buildSnapshot`.
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  DashboardSource,
  type AccountCredential,
  type DashboardSourceShape,
} from "@/server/providers/account/contract.effect";
import {
  buildTrophyMap,
  computeMeta,
  partitionTitles,
  type TrophyTitle,
} from "@/server/providers/account/psn/normalize";
import { PsnSession } from "@/server/providers/account/psn/session.effect";
import type { DashboardSourceError } from "@/server/providers/errors.effect";
import type { DashboardData } from "../snapshot";

/**
 * Assemble one un-enriched `DashboardData` from the ambient `PsnSession`.
 * Profile, played games, and trophies are fetched in parallel; a trophy failure
 * degrades to `[]` so it never sinks the snapshot. `fetchedAt` is stamped from
 * `DateTime.now`.
 *
 * Exported so a fake `PsnSession` can be injected in isolation, exercising the DI
 * boundary without the real psn-api transport.
 */
export const buildSnapshot: Effect.Effect<DashboardData, DashboardSourceError, PsnSession> =
  Effect.gen(function* () {
    const psn = yield* PsnSession;
    const [profile, playedTitles, trophyTitles] = yield* Effect.all(
      [
        psn.profile,
        psn.playedGames,
        psn.trophyTitles.pipe(Effect.orElseSucceed((): TrophyTitle[] => [])),
      ],
      { concurrency: "unbounded" }
    );

    const now = yield* DateTime.now;
    const { games, appsExcluded } = partitionTitles(playedTitles, buildTrophyMap(trophyTitles));

    return {
      profile,
      games,
      fetchedAt: DateTime.formatIso(now),
      meta: computeMeta(games, appsExcluded),
      isDemo: false,
    };
  });

/**
 * Load one account's dashboard from a transient credential: acquire a per-request
 * `PsnSession` from the credential and provide it to `buildSnapshot`. A rejected
 * credential surfaces as `CredentialRejectedError`.
 */
const loadDashboard = (
  credential: AccountCredential
): Effect.Effect<DashboardData, DashboardSourceError> =>
  Effect.provideServiceEffect(buildSnapshot, PsnSession, PsnSession.make(credential));

/**
 * The PSN `DashboardSource` layer. `loadDashboard` acquires its own per-request
 * `PsnSession`, so a handler provides only this layer.
 */
export const PsnDashboardSourceLayer: Layer.Layer<DashboardSource> = Layer.succeed(
  DashboardSource,
  {
    loadDashboard,
  } satisfies DashboardSourceShape
);
