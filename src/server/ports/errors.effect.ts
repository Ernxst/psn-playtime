import * as Data from "effect/Data";

/**
 * Tagged-error model for the platform-agnostic service ports (phase E3).
 *
 * Every failure mode here is grounded in what `src/server/psn.ts` and
 * `src/server/rawg.ts` can actually surface today — no speculative cases. The
 * port interfaces (account-provider, enrichment-provider) return these on the
 * Effect error channel; the PSN/RAWG implementations (E5/E4) raise them and the
 * server functions recover with `Effect.catchTag`/`catchTags`.
 *
 * "No data" is deliberately NOT an error: a title with no RAWG match, or a
 * missing API key, is a successful lookup with an absent value (today's
 * `undefined`), so there is no `NotFound` tag.
 */

/**
 * A transient account credential was rejected or has expired.
 *
 * Maps to `psn.ts`'s `authenticate` failing (npsso exchange rejected) — the one
 * failure `signInWithTokenHandler` surfaces today ("that token didn't work — it
 * may be expired"). Account-source-specific; enrichment uses an API-key gate,
 * not a user credential, so it never raises this.
 */
export class AccountAuthError extends Data.TaggedError("AccountAuthError")<{
  readonly reason: string;
}> {}

/**
 * An upstream request failed, was non-OK, or threw.
 *
 * Maps to `psn.ts`'s profile/played-games/trophy fetches throwing (caught today
 * by `signInWithTokenHandler`'s try/catch and the trophy fetch's `.catch`), and
 * to `rawg.ts`'s `fetchRawgJson` returning `undefined` on a non-OK response or a
 * thrown request. `provider` names the source (e.g. "psn", "rawg") for logging.
 */
export class ProviderUnavailableError extends Data.TaggedError("ProviderUnavailableError")<{
  readonly provider: string;
  readonly reason: string;
}> {}

/**
 * An upstream signalled rate limiting (HTTP 429).
 *
 * Both PSN and the RAWG free tier rate-limit in practice; today this is folded
 * into a generic failure (PSN) or swallowed to `undefined` (RAWG). Surfacing it
 * as its own tag lets E4/E5 back off explicitly. `provider` names the source.
 */
export class ProviderRateLimitedError extends Data.TaggedError("ProviderRateLimitedError")<{
  readonly provider: string;
}> {}

/** Failures the {@link AccountProvider} port can surface. */
export type AccountProviderError =
  | AccountAuthError
  | ProviderUnavailableError
  | ProviderRateLimitedError;

/** Failures the {@link EnrichmentProvider} port can surface. */
export type EnrichmentProviderError = ProviderUnavailableError | ProviderRateLimitedError;
