/**
 * `PsnSession` — an authenticated PSN session as a `Context.Service`.
 *
 * `make(credential)` performs the npsso → access-code → access-token exchange
 * ONCE, then returns a shape whose `profile` / `playedGames` / `trophyTitles`
 * effects each CAPTURE the resulting `auth` payload in closure. The consequence
 * is the whole point of this service: `auth` is never threaded as a parameter
 * across the provider boundary — callers `yield* PsnSession` and read the three
 * effects, which already know how to authenticate themselves.
 *
 * Behaviour mirrors the previous inline `psn.effect.ts` exactly:
 * - `psn-api` is promise-based, so each call is wrapped with `Effect.tryPromise`.
 *   A failed npsso/access-code exchange becomes `CredentialRejectedError` (on
 *   the layer's error channel, since it happens in `make`); a profile/played/
 *   trophy fetch becomes `ProviderRateLimitedError` on a detected HTTP 429 or
 *   `ProviderUnavailableError` otherwise.
 * - Paging goes through the shared `paginateAll` helper, preserving the #140
 *   stop-condition fix via `pagingComplete`.
 *
 * SECURITY: the npsso `Redacted` is unwrapped with `Redacted.value` only inside
 * the psn-api `tryPromise` thunk, never logged; `CredentialRejectedError.reason`
 * is a fixed string so the secret can never leak into an error.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type { AuthorizationPayload } from "psn-api";
import type { ProfileSummary } from "@/lib/psn/contract.schema";
import type { AccountCredential } from "@/server/providers/account/contract.effect";
import {
  toProfileSummary,
  type PlayedTitle,
  type TrophyTitle,
} from "@/server/providers/account/psn/normalize";
import { paginateAll } from "@/server/providers/account/psn/paginate.effect";
import {
  CredentialRejectedError,
  providerError,
  type AccountProviderError,
} from "@/server/providers/errors.effect";

const PLAYED_PAGE_LIMIT = 200;
const TROPHY_PAGE_LIMIT = 800;

/**
 * Classify a thrown psn-api error onto the provider error channel. psn-api
 * collapses every HTTP failure into a status-less thrown `Error`, so the shared
 * `providerError` detects a 429 from the message text and otherwise maps to a
 * generic outage — matching the old catch-all behaviour.
 */
const psnError = providerError("psn");

/**
 * Exchange a transient npsso for an access-token authorization payload. The
 * credential is read out of `Redacted` only to hand to psn-api and is never
 * logged; a rejection maps to `CredentialRejectedError` with a fixed reason so
 * the secret can never leak into an error.
 */
const authenticate = (
  credential: AccountCredential
): Effect.Effect<AuthorizationPayload, CredentialRejectedError> =>
  Effect.gen(function* () {
    const npsso = Redacted.value(credential);
    const accessCode = yield* Effect.tryPromise({
      try: () => exchangeNpssoForAccessCode(npsso),
      catch: () => new CredentialRejectedError({ reason: "npsso exchange rejected" }),
    });
    const tokens = yield* Effect.tryPromise({
      try: () => exchangeAccessCodeForAuthTokens(accessCode),
      catch: () =>
        new CredentialRejectedError({
          reason: "access-code exchange rejected",
        }),
    });
    return { accessToken: tokens.accessToken };
  });

const fetchProfile = (
  auth: AuthorizationPayload
): Effect.Effect<ProfileSummary, AccountProviderError> =>
  Effect.gen(function* () {
    const { profile } = yield* Effect.tryPromise({
      try: () => getProfileFromUserName(auth, "me"),
      catch: psnError,
    });
    return toProfileSummary(profile);
  });

/**
 * Page through every played-games / trophy page with the shared `paginateAll`
 * (preserving the #140 termination): each `fetchPage` wraps one psn-api call in
 * `Effect.tryPromise`, classifies failures with `psnError`, and reports its
 * page's `items` + `totalItemCount` for the stop decision.
 */
const fetchAllPlayedGames = (
  auth: AuthorizationPayload
): Effect.Effect<PlayedTitle[], AccountProviderError> =>
  paginateAll(PLAYED_PAGE_LIMIT, (offset) =>
    Effect.tryPromise({
      try: () => getUserPlayedGames(auth, "me", { limit: PLAYED_PAGE_LIMIT, offset }),
      catch: psnError,
    }).pipe(
      Effect.map((res) => ({
        items: res.titles,
        totalItemCount: res.totalItemCount,
      }))
    )
  );

const fetchTrophyTitles = (
  auth: AuthorizationPayload
): Effect.Effect<TrophyTitle[], AccountProviderError> =>
  paginateAll(TROPHY_PAGE_LIMIT, (offset) =>
    Effect.tryPromise({
      try: () => getUserTitles(auth, "me", { limit: TROPHY_PAGE_LIMIT, offset }),
      catch: psnError,
    }).pipe(
      Effect.map((res) => ({
        items: res.trophyTitles,
        totalItemCount: res.totalItemCount,
      }))
    )
  );

/** The shape a `PsnSession` exposes: three `auth`-captured session effects. */
export interface PsnSessionShape {
  readonly profile: Effect.Effect<ProfileSummary, AccountProviderError>;
  readonly playedGames: Effect.Effect<PlayedTitle[], AccountProviderError>;
  readonly trophyTitles: Effect.Effect<TrophyTitle[], AccountProviderError>;
}

/**
 * Authenticate ONCE, then hand back the three session effects with `auth`
 * captured in closure. Fails with `CredentialRejectedError` when the exchange
 * is rejected — surfaced on the error channel of whoever acquires the service.
 *
 * Exposed as the service's `make`, so `PsnSession.make(credential)` is the single
 * acquisition effect a per-request consumer injects (via
 * `Effect.provideServiceEffect`). A static `layer` is intentionally omitted: the
 * credential is per-request, so the session is acquired at the call site rather
 * than composed into a long-lived layer, and tests inject a fake `PsnSession`
 * with a plain `Layer.succeed`.
 */
const makePsnSession = Effect.fn("PsnSession.make")(function* (credential: AccountCredential) {
  const auth = yield* authenticate(credential);
  return {
    profile: fetchProfile(auth),
    playedGames: fetchAllPlayedGames(auth),
    trophyTitles: fetchTrophyTitles(auth),
  } satisfies PsnSessionShape;
});

export class PsnSession extends Context.Service<PsnSession, PsnSessionShape>()(
  "psn-playtime/server/providers/account/psn/session.effect/PsnSession",
  { make: makePsnSession }
) {}
