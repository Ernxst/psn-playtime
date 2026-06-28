import * as Effect from "effect/Effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { AppLayer } from "./runtime";
import { AppConfig } from "./services";

/**
 * Reactive runtime for the app's atoms (phase E1 foundation). Built from the
 * same composition root as `appRuntime`, it provides the example service to
 * any atom derived from it.
 */
const appAtomRuntime = Atom.runtime(AppLayer);

/**
 * Example atom that resolves the app name through the example service, proving
 * the atom <-> Effect runtime wiring. Its value is an `AsyncResult<string>`.
 */
export const appNameAtom = appAtomRuntime.atom(
  AppConfig.use((config) => Effect.succeed(config.appName))
);
