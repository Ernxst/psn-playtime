/**
 * PSN-backed implementation of the `AccountProvider` port (phase E5).
 *
 * The whole of the old `psn.ts`'s `authenticate` + `buildDashboard` — npsso
 * exchange, paged profile/played-games/trophy fetches, the played-games ⇄
 * trophy name-matching, and normalization into the un-enriched `DashboardData`
 * contract — behind the platform-agnostic seam so a future Xbox provider
 * satisfies the same shape.
 *
 * Structure after the #165 hardening:
 * - The authenticated PSN session is a `PsnSession` `Context.Service`
 *   (`./session.effect`): it does the npsso→token exchange once and captures
 *   `auth` in closure, so `auth` is never threaded as a parameter here.
 * - The pure normalization/name-matching helpers live in `./normalize`
 *   (Date-free, Effect-workflow-free), value-imported below.
 * - `buildSnapshot` `yield*`s `PsnSession`, fetches the three session effects in
 *   parallel (a trophy failure is swallowed to `[]`, exactly as the old
 *   `fetchTrophyTitles(auth).catch(() => [])`), stamps `fetchedAt` from
 *   `DateTime.now`, and assembles the contract. `fetchSnapshot(credential)`
 *   acquires the credential-bearing `PsnSession` ONCE and injects it with a
 *   single `Effect.provideServiceEffect` (a Layer `Effect.provide` here would
 *   trip the `strictEffectProvide` rule, which reserves Layer provides for
 *   entry points; the session is per-request, so it is acquired at the call
 *   site instead).
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AccountProvider,
  type AccountCredential,
  type AccountProviderShape,
} from "@/server/providers/account/contract.effect";
import {
  buildTrophyMap,
  computeMeta,
  partitionTitles,
  type TrophyTitle,
} from "@/server/providers/account/psn/normalize";
import { PsnSession } from "@/server/providers/account/psn/session.effect";
import type { AccountProviderError } from "@/server/providers/errors.effect";
import type { DashboardData } from "../snapshot";

/**
 * Fetch and normalize one account into the un-enriched `DashboardData`. Profile,
 * played games, and trophies are fetched in parallel (matching the old
 * `Promise.all`); a trophy failure is swallowed to `[]` so it never sinks the
 * snapshot. `fetchedAt` is stamped from `DateTime.now`. `auth` is captured inside
 * `PsnSession`, so it never appears as a parameter here.
 *
 * Exported so a fake `PsnSession` layer can be injected in isolation, exercising
 * the DI seam without touching the real psn-api transport.
 */
export const buildSnapshot: Effect.Effect<DashboardData, AccountProviderError, PsnSession> =
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
 * Fetch one account from a transient credential. Acquires the `PsnSession` ONCE
 * via `PsnSession.make(credential)` and injects it into `buildSnapshot` with a
 * single `Effect.provideServiceEffect`; a rejected exchange surfaces on the
 * error channel as `CredentialRejectedError`.
 */
const fetchSnapshot = (
  credential: AccountCredential
): Effect.Effect<DashboardData, AccountProviderError> =>
  Effect.provideServiceEffect(buildSnapshot, PsnSession, PsnSession.make(credential));

/**
 * The PSN `AccountProvider` layer. Self-contained (`fetchSnapshot` provides its
 * own `PsnSession` per request), so a handler provides only this one layer.
 */
export const PsnAccountProviderLayer: Layer.Layer<AccountProvider> = Layer.succeed(
  AccountProvider,
  {
    fetchSnapshot,
  } satisfies AccountProviderShape
);
