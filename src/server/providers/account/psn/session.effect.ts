/**
 * `PsnSession` — the authenticated PSN session, a psn-module-internal value.
 *
 * `authenticatePsnSession(credential)` exchanges the transient credential
 * against the ambient `PsnTransport` once and returns the session it authorises
 * (`profile` / `playedGames` / `trophyTitles`). The session is a private
 * intermediate of `loadDashboard`: it is not part of the public
 * `DashboardSource` surface and is never the result of any operation exposed
 * upward — the only public operation, `loadDashboard`, returns `DashboardData`.
 *
 * Failure model: a rejected npsso/access-code exchange fails with
 * `CredentialRejectedError`; a profile/played/trophy fetch fails with
 * `RateLimitedError` on a detected HTTP 429 or `UpstreamUnavailableError`
 * otherwise. Paging goes through the shared `paginateAll` helper.
 *
 * SECURITY: the npsso `Redacted` is unwrapped with `Redacted.value` only to
 * hand to the transport, never logged; `CredentialRejectedError.reason` is a
 * fixed string, so the secret can never leak into an error.
 */
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

/**
 * The PSN session operations. Internal to the psn module: it is a private
 * intermediate of `loadDashboard`, never part of the public `DashboardSource`
 * surface and never the result of any operation exposed upward.
 */
export interface PsnSessionShape {
  readonly profile: Effect.Effect<ProfileSummary, DashboardSourceError>;
  readonly playedGames: Effect.Effect<PlayedTitle[], DashboardSourceError>;
  readonly trophyTitles: Effect.Effect<TrophyTitle[], DashboardSourceError>;
}

/**
 * Build the session operations once `auth` is acquired: each operation binds the
 * `transport` and `auth` it authenticates with.
 */
const sessionOf = (transport: PsnTransportShape, auth: AuthorizationPayload): PsnSessionShape => ({
  profile: fetchProfile(transport, auth),
  playedGames: fetchAllPlayedGames(transport, auth),
  trophyTitles: fetchTrophyTitles(transport, auth),
});

/**
 * Authenticate `credential` against the ambient `PsnTransport` and return the
 * session it authorises. The credential is transient — exchanged once per
 * request and never stored. Fails with `CredentialRejectedError` when the
 * exchange is rejected. This is psn-module-internal plumbing for
 * `loadDashboard`; the returned session is not exposed on the public capability.
 */
export const authenticatePsnSession = (
  credential: AccountCredential
): Effect.Effect<PsnSessionShape, CredentialRejectedError, PsnTransport> =>
  Effect.gen(function* () {
    const transport = yield* PsnTransport;
    const auth = yield* authenticate(transport, credential);
    return sessionOf(transport, auth);
  }).pipe(Effect.withSpan("PsnSession.authenticate"));
