/**
 * `PsnClient` — an authenticated PSN session as a `Context.Service`.
 *
 * `make(credential)` performs the npsso → access-code → access-token exchange
 * ONCE, then returns a shape whose `profile` / `playedGames` / `trophyTitles`
 * effects each CAPTURE the resulting `auth` payload in closure. The consequence
 * is the whole point of this service: `auth` is never threaded as a parameter
 * across the provider boundary — callers `yield* PsnClient` and read the three
 * effects, which already know how to authenticate themselves.
 *
 * Behaviour mirrors the previous inline `psn.effect.ts` exactly:
 * - `psn-api` is promise-based, so each call is wrapped with `Effect.tryPromise`.
 *   A failed npsso/access-code exchange becomes `CredentialRejectedError` (on
 *   the layer's error channel, since it happens in `make`); a profile/played/
 *   trophy fetch becomes `ProviderRateLimitedError` on a detected HTTP 429 or
 *   `ProviderUnavailableError` otherwise.
 * - Paging stays `Stream.paginate` inside the session effects, preserving the
 *   #140 stop-condition fix via `pagingComplete`.
 *
 * SECURITY: the npsso `Redacted` is unwrapped with `Redacted.value` only inside
 * the psn-api `tryPromise` thunk, never logged; `CredentialRejectedError.reason`
 * is a fixed string so the secret can never leak into an error.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type { AuthorizationPayload } from "psn-api";
import type { ProfileSummary } from "@/lib/psn/types";
import type { AccountCredential } from "@/server/ports/account-provider.effect";
import {
  CredentialRejectedError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
  type AccountProviderError,
} from "@/server/ports/errors.effect";
import {
  PLAYED_PAGE_LIMIT,
  TROPHY_PAGE_LIMIT,
  pagingComplete,
  toProfileSummary,
  type PlayedTitle,
  type TrophyTitle,
} from "@/server/psn/psn-normalize";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * psn-api collapses every HTTP failure into a thrown `Error` (it never surfaces
 * the response status), so a 429 can only be detected from the message text.
 * Best-effort: treat an explicit 429 / rate-limit signal as rate-limiting and
 * everything else as a generic outage, matching the old catch-all behaviour.
 */
const isRateLimited = (message: string): boolean =>
  message.includes("429") || /too many requests|rate limit/i.test(message);

const providerError = (error: unknown): ProviderRateLimitedError | ProviderUnavailableError => {
  const message = messageOf(error);
  return isRateLimited(message)
    ? new ProviderRateLimitedError({ provider: "psn" })
    : new ProviderUnavailableError({ provider: "psn", reason: message });
};

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
      catch: providerError,
    });
    return toProfileSummary(profile);
  });

/**
 * Page through a paginated PSN endpoint with `Stream.paginate`: the state is the
 * running `offset`, each step fetches one page, and `pagingComplete` decides
 * (identically to the old loop, preserving the #140 fix) whether to continue
 * with `Option.some(nextOffset)` or stop with `Option.none()`. `Stream.runCollect`
 * flattens the pages into one array.
 */
const fetchAllPlayedGames = (
  auth: AuthorizationPayload
): Effect.Effect<PlayedTitle[], AccountProviderError> =>
  Stream.paginate(0, (offset: number) =>
    Effect.tryPromise({
      try: () => getUserPlayedGames(auth, "me", { limit: PLAYED_PAGE_LIMIT, offset }),
      catch: providerError,
    }).pipe(
      Effect.map((res) => {
        const next = offset + res.titles.length;
        const stop = pagingComplete(res.titles.length, next, res.totalItemCount, PLAYED_PAGE_LIMIT);
        return [res.titles, stop ? Option.none() : Option.some(next)] as const;
      })
    )
  ).pipe(Stream.runCollect);

const fetchTrophyTitles = (
  auth: AuthorizationPayload
): Effect.Effect<TrophyTitle[], AccountProviderError> =>
  Stream.paginate(0, (offset: number) =>
    Effect.tryPromise({
      try: () => getUserTitles(auth, "me", { limit: TROPHY_PAGE_LIMIT, offset }),
      catch: providerError,
    }).pipe(
      Effect.map((res) => {
        const next = offset + res.trophyTitles.length;
        const stop = pagingComplete(
          res.trophyTitles.length,
          next,
          res.totalItemCount,
          TROPHY_PAGE_LIMIT
        );
        return [res.trophyTitles, stop ? Option.none() : Option.some(next)] as const;
      })
    )
  ).pipe(Stream.runCollect);

/** The shape a `PsnClient` exposes: three `auth`-captured session effects. */
export interface PsnClientShape {
  readonly profile: Effect.Effect<ProfileSummary, AccountProviderError>;
  readonly playedGames: Effect.Effect<PlayedTitle[], AccountProviderError>;
  readonly trophyTitles: Effect.Effect<TrophyTitle[], AccountProviderError>;
}

/**
 * Authenticate ONCE, then hand back the three session effects with `auth`
 * captured in closure. Fails with `CredentialRejectedError` when the exchange
 * is rejected — surfaced on the error channel of whoever acquires the service.
 *
 * Exposed as the service's `make`, so `PsnClient.make(credential)` is the single
 * acquisition effect a per-request consumer injects (via
 * `Effect.provideServiceEffect`). A static `layer` is intentionally omitted: the
 * credential is per-request, so the client is acquired at the call site rather
 * than composed into a long-lived layer, and tests inject a fake `PsnClient`
 * with a plain `Layer.succeed`.
 */
const makePsnClient = Effect.fn("PsnClient.make")(function* (credential: AccountCredential) {
  const auth = yield* authenticate(credential);
  return {
    profile: fetchProfile(auth),
    playedGames: fetchAllPlayedGames(auth),
    trophyTitles: fetchTrophyTitles(auth),
  } satisfies PsnClientShape;
});

export class PsnClient extends Context.Service<PsnClient, PsnClientShape>()(
  "psn-playtime/server/psn/psn-client.effect/PsnClient",
  { make: makePsnClient }
) {}
