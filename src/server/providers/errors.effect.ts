import * as Data from "effect/Data";

/**
 * Tagged-error model for the platform-agnostic capability ports (phase E3).
 *
 * Every failure mode here is grounded in what `src/server/providers/account/psn/provider.effect.ts` and
 * `src/server/providers/enrichment/rawg/client.ts` can actually surface today — no speculative cases. The
 * capability ports ({@link DashboardSource}, {@link TitleEnrichment}) return these on the
 * Effect error channel; the PSN/RAWG implementations (E5/E4) raise them and the
 * server functions recover with `Effect.catchTag`/`catchTags`.
 *
 * "No data" is deliberately NOT an error: a title with no RAWG match, or a
 * missing API key, is a successful lookup with an absent value (today's
 * `undefined`), so there is no `NotFound` tag.
 */

/**
 * The known upstream sources a failure can name. A closed union (not `string`)
 * so every error payload, log line, and `catchTag` handler is forced to mention
 * a real source — "psn" (account) or "rawg" (enrichment). This is safe,
 * non-sensitive structured context, not raw upstream text.
 */
export type ProviderSource = "psn" | "rawg";

/**
 * Stable, sanitised classification of why an upstream is unavailable. These are
 * the typed `reason` codes that replace raw upstream message text on
 * {@link UpstreamUnavailableError}: they are fixed strings we control, so no
 * vendor text, URL, header, request detail, or token can ever ride out on the
 * error channel.
 *
 * Today every non-rate-limited upstream failure (a status-less psn-api throw, a
 * non-OK fetch) collapses to the single honest code `"upstream_error"` — we have
 * no further structural signal to split it on. The raw thrown value is inspected
 * only locally during classification and then discarded; it is never retained.
 */
export type UpstreamUnavailableReason = "upstream_error";

/**
 * A transient account credential was rejected or has expired.
 *
 * Maps to `psn.ts`'s `authenticate` failing (npsso exchange rejected) — the one
 * failure `signInWithTokenHandler` surfaces today ("that token didn't work — it
 * may be expired"). Account-source-specific; enrichment uses an API-key gate,
 * not a user credential, so it never raises this. `reason` is a fixed,
 * caller-authored string (never upstream text), so the npsso can never leak.
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
 * thrown request. `provider` names the source; `reason` is a stable
 * {@link UpstreamUnavailableReason} code, NOT raw upstream text.
 *
 * The payload deliberately carries NO raw upstream value — no `cause`, no
 * message. The thrown error is inspected only locally during classification
 * (see {@link providerError}) and then DISCARDED, so this typed error can be
 * logged, inspected after a failed run, or cross a framework boundary without
 * ever leaking vendor text, URLs, headers, request detail, or tokens.
 */
export class UpstreamUnavailableError extends Data.TaggedError("UpstreamUnavailableError")<{
  readonly provider: ProviderSource;
  readonly reason: UpstreamUnavailableReason;
}> {}

/**
 * An upstream signalled rate limiting (HTTP 429).
 *
 * Both PSN and the RAWG free tier rate-limit in practice; today this is folded
 * into a generic failure (PSN) or swallowed to `undefined` (RAWG). Surfacing it
 * as its own tag lets E4/E5 back off explicitly. `provider` names the source.
 */
export class RateLimitedError extends Data.TaggedError("RateLimitedError")<{
  readonly provider: ProviderSource;
}> {}

/** Failures the {@link DashboardSource} port can surface. */
export type DashboardSourceError =
  | CredentialRejectedError
  | UpstreamUnavailableError
  | RateLimitedError;

/** Failures the {@link TitleEnrichment} port can surface. */
export type TitleEnrichmentError = UpstreamUnavailableError | RateLimitedError;

/** The message of a thrown value, falling back to its string form. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * BEST-EFFORT, MESSAGE-BASED rate-limit fallback for status-less transports.
 *
 * Prefer STRUCTURAL detection (an HTTP 429 status) wherever the transport
 * exposes it — the RAWG provider reads `response.status === 429` directly. This
 * fallback exists ONLY for transports that collapse every HTTP failure into a
 * status-less thrown `Error` (psn-api), where the message text is the sole
 * signal. It is deliberately conservative: an explicit 429 or rate-limit phrase
 * counts, nothing else.
 */
const isRateLimitedMessage = (message: string): boolean =>
  message.includes("429") || /too many requests|rate limit/i.test(message);

/**
 * Classify a thrown upstream error from a STATUS-LESS transport onto the shared
 * failure channel: `RateLimitedError` when the message looks like a 429
 * (best-effort, see {@link isRateLimitedMessage}), else a generic
 * `UpstreamUnavailableError` with the stable `"upstream_error"` code. The raw
 * thrown value is inspected ONLY locally here to make that structural decision
 * and is then DISCARDED — it is never attached to the returned error, so no
 * vendor text, URL, header, request detail, or token can ride out on the typed
 * channel. `provider` names the source.
 *
 * Curried so a call site binds its source once and uses the result directly as
 * a `catch` thunk (e.g. `catch: providerError("psn")`).
 */
export const providerError =
  (provider: ProviderSource) =>
  (error: unknown): RateLimitedError | UpstreamUnavailableError =>
    isRateLimitedMessage(messageOf(error))
      ? new RateLimitedError({ provider })
      : new UpstreamUnavailableError({ provider, reason: "upstream_error" });
