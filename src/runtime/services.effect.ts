import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Phase E1 foundation example service.
 *
 * A trivial, read-only application config used purely to prove the Effect
 * runtime/layer wiring. Real services (account/enrichment providers) arrive in
 * later phases — see docs/rules/effect.md and issue #165.
 */
export interface AppConfigShape {
  readonly appName: string;
}

export class AppConfig extends Context.Service<AppConfig>()(
  "psn-playtime/runtime/services.effect/AppConfig",
  {
    make: Effect.succeed<AppConfigShape>({ appName: "psn-playtime" }),
  }
) {
  static readonly layer = Layer.effect(this, this.make);
}

/**
 * Example tagged error demonstrating the typed error channel. Failures are
 * modelled as data (never thrown), so callers recover with `Effect.catchTag`.
 */
export class AppConfigError extends Data.TaggedError("AppConfigError")<{
  readonly reason: string;
}> {}

/**
 * Example effect that reads the service and fails on the typed error channel
 * when the configured name does not match — exercises service resolution and
 * the tagged error model together.
 */
export const requireAppName = (
  expected: string
): Effect.Effect<string, AppConfigError, AppConfig> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (config.appName !== expected) {
      return yield* new AppConfigError({
        reason: `expected ${expected}, received ${config.appName}`,
      });
    }
    return config.appName;
  });
