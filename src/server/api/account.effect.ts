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
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { runServer } from "@/runtime/runtime.effect";
import {
  DashboardSource,
  type AccountCredential,
} from "@/server/providers/account/contract.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import { DashboardData } from "@/server/providers/account/snapshot";

const SignInInput = Schema.Struct({
  npsso: Schema.Trim.check(Schema.isNonEmpty()),
});
const signInInput = Schema.toStandardSchemaV1(SignInInput);

/** Validates the provider's snapshot against the `DashboardData` contract before it crosses the server-fn boundary. */
const decodeDashboard = Schema.decodeUnknownEffect(DashboardData);

/**
 * Fetch and normalize one account from a transient credential. Runs the PSN
 * `DashboardSource`, which is provided here as the entry-point layer, then
 * decodes the snapshot against the `DashboardData` contract before it goes over
 * the wire (a pass-through for valid data).
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
 */
export function signInWithTokenHandler(
  data: Schema.Schema.Type<typeof SignInInput>
): Promise<DashboardData> {
  const credential = Redacted.make(data.npsso);
  return credential.pipe(signInEffect, runServer).catch(() => {
    throw new Error(
      "That token didn't work — it may be expired. Grab a fresh npsso and try again."
    );
  });
}

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) => signInWithTokenHandler(data));
