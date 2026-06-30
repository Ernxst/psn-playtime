/**
 * PSN-backed implementation of the `DashboardSource` capability: authenticate an
 * npsso credential, fetch the profile, played games, and trophies, and normalize
 * them into the un-enriched `DashboardData` contract.
 *
 * - The authenticated session comes from `withPsnSession` (`./session.effect`):
 *   it performs the npsso→token exchange once and hands the session to a
 *   callback, so `auth` is not threaded through this module.
 * - The pure normalization/name-matching helpers live in `./normalize`.
 * - `buildSnapshot` takes the in-hand `PsnSessionShape`, fetches the three
 *   operations in parallel (a trophy failure degrades to `[]`), stamps
 *   `fetchedAt`, and assembles the contract. `loadDashboard` runs it inside a
 *   per-request `withPsnSession` boundary.
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
import {
  withPsnSession,
  type PsnSessionShape,
} from "@/server/providers/account/psn/session.effect";
import { PsnTransport } from "@/server/providers/account/psn/transport.effect";
import type { DashboardSourceError } from "@/server/providers/errors.effect";
import type { DashboardData } from "../snapshot";

/**
 * Assemble one un-enriched `DashboardData` from the in-hand `PsnSessionShape`.
 * Profile, played games, and trophies are fetched in parallel; a trophy failure
 * degrades to `[]` so it never sinks the snapshot. `fetchedAt` is stamped from
 * `DateTime.now`.
 *
 * Exported so a fake session can be passed in isolation, exercising the boundary
 * without the real psn-api transport.
 */
export const buildSnapshot = (
  session: PsnSessionShape
): Effect.Effect<DashboardData, DashboardSourceError> =>
  Effect.gen(function* () {
    const [profile, playedTitles, trophyTitles] = yield* Effect.all(
      [
        session.profile,
        session.playedGames,
        session.trophyTitles.pipe(Effect.orElseSucceed((): TrophyTitle[] => [])),
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
 * The PSN `DashboardSource` layer, requiring `PsnTransport`. `loadDashboard`
 * runs `buildSnapshot` inside a per-request `withPsnSession` boundary: the
 * credential is authenticated per request and the session is reachable only
 * within the boundary. A rejected credential surfaces as
 * `CredentialRejectedError`.
 */
export const PsnDashboardSourceLayer: Layer.Layer<DashboardSource, never, PsnTransport> =
  Layer.effect(
    DashboardSource,
    Effect.map(
      PsnTransport,
      (transport): DashboardSourceShape => ({
        loadDashboard: (credential: AccountCredential) =>
          withPsnSession(credential, buildSnapshot).pipe(
            Effect.provideService(PsnTransport, transport)
          ),
      })
    )
  );
