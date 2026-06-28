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
export class CredentialRejectedError extends Data.TaggedError("CredentialRejectedError")<{
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
  | CredentialRejectedError
  | ProviderUnavailableError
  | ProviderRateLimitedError;

/** Failures the {@link EnrichmentProvider} port can surface. */
export type EnrichmentProviderError = ProviderUnavailableError | ProviderRateLimitedError;

/** The message of a thrown value, falling back to its string form. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Whether an error message signals upstream rate limiting. A building block for
 * providers (like psn-api) whose transport collapses every HTTP failure into a
 * status-less thrown `Error`, so a 429 can only be detected from the message
 * text. Best-effort: an explicit 429 or rate-limit phrase counts.
 */
const isRateLimited = (message: string): boolean =>
  message.includes("429") || /too many requests|rate limit/i.test(message);

/**
 * Classify a thrown upstream error into the shared provider error channel:
 * `ProviderRateLimitedError` when the message looks like a 429, else a generic
 * `ProviderUnavailableError` carrying the message as `reason`. `provider` names
 * the source ("psn", …) so one classifier serves any status-less transport.
 *
 * Curried so a call site binds its source once and uses the result directly as
 * a `catch` thunk (e.g. `catch: providerError("psn")`).
 */
export const providerError =
  (provider: string) =>
  (error: unknown): ProviderRateLimitedError | ProviderUnavailableError => {
    const message = messageOf(error);
    return isRateLimited(message)
      ? new ProviderRateLimitedError({ provider })
      : new ProviderUnavailableError({ provider, reason: message });
  };
