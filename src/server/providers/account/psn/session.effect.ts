/**
 * `PsnSession` — an authenticated PSN session as a `Context.Service`.
 *
 * `make(credential)` performs the npsso → access-code → access-token exchange
 * once, then returns a shape whose `profile` / `playedGames` / `trophyTitles`
 * effects each capture the resulting `auth`, so `auth` is never threaded as a
 * parameter; callers read the three effects, which authenticate themselves.
 *
 * Failure model: a rejected npsso/access-code exchange fails `make` with
 * `CredentialRejectedError`; a profile/played/trophy fetch fails with
 * `RateLimitedError` on a detected HTTP 429 or `UpstreamUnavailableError`
 * otherwise. Paging goes through the shared `paginateAll` helper.
 *
 * SECURITY: the npsso `Redacted` is unwrapped with `Redacted.value` only to
 * hand to the transport, never logged; `CredentialRejectedError.reason` is a
 * fixed string, so the secret can never leak into an error.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { AccountCredential } from "@/server/providers/account/contract.effect";
import {
  toProfileSummary,
  type PlayedTitle,
  type TrophyTitle,
} from "@/server/providers/account/psn/normalize";
import { paginateAll } from "@/server/providers/account/psn/paginate.effect";
import {
  PsnTransport,
  type AuthorizationPayload,
  type PsnTransportShape,
} from "@/server/providers/account/psn/transport.effect";
import {
  CredentialRejectedError,
  providerError,
  type DashboardSourceError,
} from "@/server/providers/errors.effect";
import type { ProfileSummary } from "../snapshot";

const PLAYED_PAGE_LIMIT = 200;
const TROPHY_PAGE_LIMIT = 800;

/**
 * Classify a raw transport failure onto the failure channel. psn-api collapses
 * every HTTP failure into a status-less thrown `Error`, so `providerError`
 * detects a 429 from the message text and otherwise maps to a generic outage.
 */
const psnError = providerError("psn");

/**
 * Exchange a transient npsso for an access-token authorization payload. The
 * credential is read out of `Redacted` only to hand to the transport and is
 * never logged; a rejection maps to `CredentialRejectedError` with a fixed
 * reason so the secret can never leak into an error.
 */
const authenticate = (
  transport: PsnTransportShape,
  credential: AccountCredential
): Effect.Effect<AuthorizationPayload, CredentialRejectedError> =>
  Effect.gen(function* () {
    const npsso = Redacted.value(credential);
    const accessCode = yield* transport
      .exchangeNpssoForAccessCode(npsso)
      .pipe(
        Effect.mapError(() => new CredentialRejectedError({ reason: "npsso exchange rejected" }))
      );
    const tokens = yield* transport
      .exchangeAccessCodeForAuthTokens(accessCode)
      .pipe(
        Effect.mapError(
          () => new CredentialRejectedError({ reason: "access-code exchange rejected" })
        )
      );
    return { accessToken: tokens.accessToken };
  });

const fetchProfile = (
  transport: PsnTransportShape,
  auth: AuthorizationPayload
): Effect.Effect<ProfileSummary, DashboardSourceError> =>
  transport.getProfile(auth).pipe(
    Effect.mapError((error) => psnError(error.cause)),
    Effect.map(({ profile }) => toProfileSummary(profile))
  );

/**
 * Page through every played-games / trophy page with the shared `paginateAll`:
 * each page is one transport call, classifies a failure's `cause` with
 * `psnError`, and reports its `items` + `totalItemCount` for the stop decision.
 */
const fetchAllPlayedGames = (
  transport: PsnTransportShape,
  auth: AuthorizationPayload
): Effect.Effect<PlayedTitle[], DashboardSourceError> =>
  paginateAll(PLAYED_PAGE_LIMIT, (offset) =>
    transport.getPlayedGames(auth, { limit: PLAYED_PAGE_LIMIT, offset }).pipe(
      Effect.mapError((error) => psnError(error.cause)),
      Effect.map((res) => ({
        items: res.titles,
        totalItemCount: res.totalItemCount,
      }))
    )
  );

const fetchTrophyTitles = (
  transport: PsnTransportShape,
  auth: AuthorizationPayload
): Effect.Effect<TrophyTitle[], DashboardSourceError> =>
  paginateAll(TROPHY_PAGE_LIMIT, (offset) =>
    transport.getUserTitles(auth, { limit: TROPHY_PAGE_LIMIT, offset }).pipe(
      Effect.mapError((error) => psnError(error.cause)),
      Effect.map((res) => ({
        items: res.trophyTitles,
        totalItemCount: res.totalItemCount,
      }))
    )
  );

/** The shape a `PsnSession` exposes: three `auth`-captured session effects. */
export interface PsnSessionShape {
  readonly profile: Effect.Effect<ProfileSummary, DashboardSourceError>;
  readonly playedGames: Effect.Effect<PlayedTitle[], DashboardSourceError>;
  readonly trophyTitles: Effect.Effect<TrophyTitle[], DashboardSourceError>;
}

/**
 * `PsnSession.make(credential)` authenticates the credential against the ambient
 * `PsnTransport`, then returns the three session effects with `transport` and
 * `auth` captured. Fails with `CredentialRejectedError` when the exchange is
 * rejected.
 */
const makePsnSession = Effect.fn("PsnSession.make")(function* (credential: AccountCredential) {
  const transport = yield* PsnTransport;
  const auth = yield* authenticate(transport, credential);
  return {
    profile: fetchProfile(transport, auth),
    playedGames: fetchAllPlayedGames(transport, auth),
    trophyTitles: fetchTrophyTitles(transport, auth),
  } satisfies PsnSessionShape;
});

export class PsnSession extends Context.Service<PsnSession, PsnSessionShape>()(
  "psn-playtime/server/providers/account/psn/session.effect/PsnSession",
  { make: makePsnSession }
) {}
