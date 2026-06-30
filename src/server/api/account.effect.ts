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
 * Fetch and normalize one account from a transient npsso token. The token is
 * never stored server-side; the caller persists the returned `DashboardData` in
 * the client cache. Throws a friendly error when the token is rejected (or any
 * fetch fails), exactly as before.
 *
 * `transport` is the PSN transport `Layer`, defaulting to the live `psn-api`
 * binding; it is the seam where a fake transport substitutes in tests.
 */
export function signInWithTokenHandler(
  data: Schema.Schema.Type<typeof SignInInput>,
  transport: Layer.Layer<PsnTransport> = PsnTransportLive
): Promise<DashboardData> {
  const credential = Redacted.make(data.npsso);
  return (
    signInEffect(credential)
      // @effect-diagnostics-next-line strictEffectProvide:off
      .pipe(Effect.provide(transport), runServer)
      .catch(() => {
        throw new Error(
          "That token didn't work — it may be expired. Grab a fresh npsso and try again."
        );
      })
  );
}

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) => signInWithTokenHandler(data));
