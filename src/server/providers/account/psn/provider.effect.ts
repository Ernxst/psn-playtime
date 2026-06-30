/**
 * PSN-backed implementation of the `DashboardSource` capability: authenticate an
 * npsso credential, fetch the profile, played games, and trophies, and normalize
 * them into the un-enriched `DashboardData` contract.
 *
 * - The authenticated session is the scoped `PsnSession` capability
 *   (`./session.effect`): its acquire performs the npsso→token exchange once,
 *   and the scope owns `auth`, so `auth` is not threaded through this module.
 * - The pure normalization/name-matching helpers live in `./normalize`.
 * - `buildSnapshot` reads `PsnSession`, invokes the three session methods in
 *   parallel (a trophy failure degrades to `[]`), stamps `fetchedAt`, and
 *   assembles the contract. `loadDashboard` provides a per-request
 *   `psnSessionLayer` whose scope owns the credential's lifetime.
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
import { acquirePsnSession, PsnSession } from "@/server/providers/account/psn/session.effect";
import { PsnTransport } from "@/server/providers/account/psn/transport.effect";
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
 * The PSN `DashboardSource` layer, requiring `PsnTransport`. `loadDashboard`
 * opens a per-request `Effect.scoped` boundary, acquires the credential-bound
 * `PsnSession` within it, and runs `buildSnapshot` against it; the scope owns the
 * session lifetime, so the credential is released when the snapshot completes. A
 * rejected credential surfaces as `CredentialRejectedError`.
 */
export const PsnDashboardSourceLayer: Layer.Layer<DashboardSource, never, PsnTransport> =
  Layer.effect(
    DashboardSource,
    Effect.map(
      PsnTransport,
      (transport): DashboardSourceShape => ({
        loadDashboard: (credential: AccountCredential) =>
          acquirePsnSession(credential).pipe(
            Effect.flatMap((session) => Effect.provideService(buildSnapshot, PsnSession, session)),
            Effect.scoped,
            Effect.provideService(PsnTransport, transport)
          ),
      })
    )
  );
