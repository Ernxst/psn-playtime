import * as Data from "effect/Data";

/**
 * Tagged-error model for the account and enrichment capabilities. The
 * {@link DashboardSource} and {@link TitleEnrichment} ports return these on the
 * Effect error channel; callers recover them with `Effect.catchTag` /
 * `Effect.catchTags`.
 *
 * Absent data is not a failure: a lookup with no match is a success with an
 * absent value, so there is no `NotFound`.
 */

/**
 * The upstream sources a failure can name. A closed union so every error payload
 * and handler names a real source. Safe, non-sensitive context — never raw
 * upstream text.
 */
export type ProviderSource = "psn" | "rawg";

/**
 * Why an upstream is unavailable, as a fixed code we control rather than raw
 * upstream text — so no vendor message, URL, header, request detail, or token
 * can ride out on the error channel. `"upstream_error"` is the single code: an
 * upstream that failed, responded non-OK, or threw.
 */
export type UpstreamUnavailableReason = "upstream_error";

/**
 * A transient account credential was rejected or has expired. Specific to the
 * account capability. `reason` is a fixed, caller-authored string, never
 * upstream text, so the credential can never leak into the error.
 */
export class CredentialRejectedError extends Data.TaggedError("CredentialRejectedError")<{
  readonly reason: string;
}> {}

/**
 * An upstream request failed, was non-OK, or threw. `provider` names the source;
 * `reason` is a stable {@link UpstreamUnavailableReason} code.
 *
 * The payload carries NO raw upstream value — no `cause`, no message. The thrown
 * value is inspected only locally during classification (see
 * {@link providerError}) and then discarded, so this error can be logged or
 * cross a boundary without leaking vendor text, URLs, headers, request detail,
 * or tokens.
 */
export class UpstreamUnavailableError extends Data.TaggedError("UpstreamUnavailableError")<{
  readonly provider: ProviderSource;
  readonly reason: UpstreamUnavailableReason;
}> {}

/** An upstream signalled rate limiting (HTTP 429). `provider` names the source. */
export class RateLimitedError extends Data.TaggedError("RateLimitedError")<{
  readonly provider: ProviderSource;
}> {}

/** Failures the {@link DashboardSource} capability can surface. */
export type DashboardSourceError =
  | CredentialRejectedError
  | UpstreamUnavailableError
  | RateLimitedError;

/** Failures the {@link TitleEnrichment} capability can surface. */
export type TitleEnrichmentError = UpstreamUnavailableError | RateLimitedError;

/** The message of a thrown value, falling back to its string form. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Best-effort, message-based rate-limit detection — a fallback for transports
 * that collapse HTTP failures into a status-less thrown `Error`, where the
 * message text is the only signal. Prefer a structural HTTP 429 status where the
 * transport exposes one. Conservative: an explicit 429 or rate-limit phrase
 * counts, nothing else.
 */
const isRateLimitedMessage = (message: string): boolean =>
  message.includes("429") || /too many requests|rate limit/i.test(message);

/**
 * Classify a thrown upstream value onto the shared failure channel:
 * `RateLimitedError` when the message looks like a 429 (see
 * {@link isRateLimitedMessage}), else `UpstreamUnavailableError` with the stable
 * `"upstream_error"` code. The thrown value is inspected only locally and then
 * discarded — never attached to the returned error — so nothing from upstream
 * leaks onto the typed channel. `provider` names the source.
 *
 * Curried so a call site binds its source once (e.g. `catch: providerError("psn")`).
 */
export const providerError =
  (provider: ProviderSource) =>
  (error: unknown): RateLimitedError | UpstreamUnavailableError =>
    isRateLimitedMessage(messageOf(error))
      ? new RateLimitedError({ provider })
      : new UpstreamUnavailableError({ provider, reason: "upstream_error" });
