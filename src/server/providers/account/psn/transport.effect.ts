/**
 * `PsnTransport` — the narrow capability that owns every `psn-api` interop call
 * account-loading needs: the npsso → access-code → access-token exchange and the
 * profile / played-games / trophy fetches.
 *
 * The `psn-api` module is imported in exactly one place: `PsnTransportLive`. The
 * session and provider depend on this *service* (through the Effect
 * environment), so the transport can be substituted with a fake `Layer` at the
 * production seam rather than via module-state mocking.
 *
 * Each operation surfaces the raw upstream failure as an `Error` on its error
 * channel; classification onto the sanitised boundary channel
 * (`CredentialRejectedError` / `RateLimitedError` / `UpstreamUnavailableError`)
 * is the consumer's responsibility, so no raw upstream value reaches the
 * `DashboardSource` boundary.
 */
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type {
  AuthorizationPayload,
  AuthTokensResponse,
  ProfileFromUserNameResponse,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";

export type { AuthorizationPayload };

/**
 * The failure every transport operation raises: the raw upstream value wrapped
 * in `cause`. It stays internal to the transport seam — the consumer inspects
 * `cause` to classify onto the sanitised boundary errors and never forwards the
 * wrapper, so no raw upstream value reaches the `DashboardSource` boundary.
 */
export class PsnTransportError extends Data.TaggedError("PsnTransportError")<{
  readonly cause: unknown;
}> {}

/** One page request against a paged PSN endpoint. */
interface PsnPageRequest {
  readonly limit: number;
  readonly offset: number;
}

/**
 * The `psn-api` operations account-loading needs. Each returns the raw upstream
 * response and fails with `PsnTransportError`; the authenticating account is
 * always `"me"`, so callers never pass an account id.
 */
export interface PsnTransportShape {
  readonly exchangeNpssoForAccessCode: (npsso: string) => Effect.Effect<string, PsnTransportError>;
  readonly exchangeAccessCodeForAuthTokens: (
    accessCode: string
  ) => Effect.Effect<AuthTokensResponse, PsnTransportError>;
  readonly getProfile: (
    auth: AuthorizationPayload
  ) => Effect.Effect<ProfileFromUserNameResponse, PsnTransportError>;
  readonly getPlayedGames: (
    auth: AuthorizationPayload,
    page: PsnPageRequest
  ) => Effect.Effect<UserPlayedGamesResponse, PsnTransportError>;
  readonly getUserTitles: (
    auth: AuthorizationPayload,
    page: PsnPageRequest
  ) => Effect.Effect<UserTitlesResponse, PsnTransportError>;
}

export class PsnTransport extends Context.Service<PsnTransport, PsnTransportShape>()(
  "psn-playtime/server/providers/account/psn/transport.effect/PsnTransport"
) {}

/** Wrap a `psn-api` promise, surfacing the raw thrown value as a `PsnTransportError`. */
const tryPsn = <A>(thunk: () => Promise<A>): Effect.Effect<A, PsnTransportError> =>
  Effect.tryPromise({ try: thunk, catch: (cause) => new PsnTransportError({ cause }) });

/** The live transport: the sole binding to the real `psn-api` module. */
export const PsnTransportLive: Layer.Layer<PsnTransport> = Layer.succeed(PsnTransport, {
  exchangeNpssoForAccessCode: (npsso) => tryPsn(() => exchangeNpssoForAccessCode(npsso)),
  exchangeAccessCodeForAuthTokens: (accessCode) =>
    tryPsn(() => exchangeAccessCodeForAuthTokens(accessCode)),
  getProfile: (auth) => tryPsn(() => getProfileFromUserName(auth, "me")),
  getPlayedGames: (auth, page) => tryPsn(() => getUserPlayedGames(auth, "me", page)),
  getUserTitles: (auth, page) => tryPsn(() => getUserTitles(auth, "me", page)),
});
