/**
 * Account server-fn entry point. Loads a single PlayStation account's dashboard
 * and normalizes it into the `DashboardData` contract.
 *
 * The PSN fetch + normalization lives behind the `DashboardSource` port,
 * implemented by `PsnDashboardSourceLayer`
 * (`@/server/providers/account/psn/provider.effect`); this module wraps it in a
 * `createServerFn` handler and provides the layer as the entry point. The npsso
 * token is used transiently to load an account once; it is never stored
 * server-side. The derived `DashboardData` is cached client-side
 * (`@/stores/dashboard-store`), which is the source for revisits.
 */
import { createServerFn } from "@tanstack/react-start";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { runServer } from "@/runtime/runtime.effect";
import {
  DashboardSource,
  type AccountCredential,
} from "@/server/providers/account/contract.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import {
  PsnTransportLive,
  type PsnTransport,
} from "@/server/providers/account/psn/transport.effect";
import { DashboardData } from "@/server/providers/account/snapshot";

const SignInInput = Schema.Struct({
  npsso: Schema.Trim.check(Schema.isNonEmpty()),
});
const signInInput = Schema.toStandardSchemaV1(SignInInput);

/**
 * The distinct sign-in failure kinds the boundary surfaces to the client. A
 * stable discriminant, separate from the user-facing message, so a caller can
 * route recovery (re-enter token vs retry shortly vs retry later vs our bug)
 * without parsing prose:
 * - `credential_rejected` — the npsso was rejected or expired (re-enter token).
 * - `rate_limited` — PlayStation is throttling (retry shortly).
 * - `upstream_unavailable` — PlayStation is down (retry later, not a token fault).
 * - `internal` — our contract/decode broke or an unexpected defect (our bug).
 */
type SignInErrorKind = "credential_rejected" | "rate_limited" | "upstream_unavailable" | "internal";

/**
 * Stable, friendly, user-facing copy keyed on {@link SignInErrorKind}. SECURITY
 * (#270): each string is fixed and caller-authored — never interpolates raw
 * upstream text, URLs, headers, or the token. The typed provider errors already
 * carry no raw value, and translation here keys ONLY on their tag, so nothing
 * from upstream can ride out on the client error.
 */
const SIGN_IN_MESSAGES: Record<SignInErrorKind, string> = {
  credential_rejected:
    "That token didn't work — it may be expired. Grab a fresh npsso and try again.",
  rate_limited: "PlayStation is rate-limiting requests. Wait a moment and try again.",
  upstream_unavailable: "PlayStation is unavailable right now. Try again later.",
  internal: "Something went wrong on our end. Please try again.",
};

/**
 * The serializable client-facing sign-in error: a stable {@link SignInErrorKind}
 * discriminant plus its fixed friendly `message`. A `Data.TaggedError` so it is
 * a real `Error` (it rejects the handler's `Promise` and reaches react-query's
 * `onError`) while staying on the Effect failure channel with a `_tag`.
 *
 * Note: TanStack Start's server-fn error serializer (`ShallowErrorPlugin`)
 * narrows any thrown `Error` to its `message` over the wire, so the user-facing
 * distinction crosses to the client as the distinct `message`; `kind` is the
 * in-process discriminant for direct callers and tests.
 */
class SignInError extends Data.TaggedError("SignInError")<{
  readonly kind: SignInErrorKind;
  readonly message: string;
}> {}

const makeSignInError = (kind: SignInErrorKind): SignInError =>
  new SignInError({ kind, message: SIGN_IN_MESSAGES[kind] });

const signInError = (kind: SignInErrorKind) => Effect.fail(makeSignInError(kind));

/** Validates the provider's snapshot against the `DashboardData` contract before it crosses the server-fn boundary. */
const decodeDashboard = Schema.decodeUnknownEffect(DashboardData);

/**
 * Fetch and normalize one account from a transient credential. Runs the PSN
 * `DashboardSource`, then decodes the snapshot against the `DashboardData`
 * contract before it goes over the wire (a pass-through for valid data). The
 * `PsnTransport` the source needs stays open here, satisfied by the layer the
 * handler provides.
 */
const signInEffect = (credential: AccountCredential) =>
  Effect.flatMap(DashboardSource, (provider) => provider.loadDashboard(credential)).pipe(
    Effect.flatMap(decodeDashboard),
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(PsnDashboardSourceLayer)
  );

/**
 * The server-fn boundary for a transient npsso token: validate, provide the PSN
 * `transport` `Layer` (defaulting to the live `psn-api` binding), and translate
 * each typed failure into a DISTINCT, serializable {@link SignInError}. Matching
 * is by error tag (`Effect.catchTags`), never a blanket catch, so a credential
 * rejection, a rate-limit, an outage, and a `DashboardData` contract breakage
 * each keep their own recovery path instead of collapsing into "expired token".
 * Any unexpected defect becomes a safe generic `internal` error so nothing
 * unmodelled leaks. The token is never stored server-side; the caller persists
 * the returned `DashboardData` in the client cache.
 */
export function signInWithTokenHandler(
  data: Schema.Schema.Type<typeof SignInInput>,
  transport: Layer.Layer<PsnTransport> = PsnTransportLive
): Promise<DashboardData> {
  const credential = Redacted.make(data.npsso);
  return signInEffect(credential)
    .pipe(
      Effect.catchTags({
        CredentialRejectedError: () => signInError("credential_rejected"),
        RateLimitedError: () => signInError("rate_limited"),
        UpstreamUnavailableError: () => signInError("upstream_unavailable"),
        // A `DashboardData` decode failure is OUR contract breaking, not the token.
        SchemaError: () => signInError("internal"),
      }),
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(transport),
      runServer
    )
    .catch((cause: unknown) => {
      throw cause instanceof SignInError ? cause : makeSignInError("internal");
    });
}

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) => signInWithTokenHandler(data));
