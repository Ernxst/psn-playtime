import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { describe, expect, it, onTestFinished } from "vitest";
import { AppLayer, appRuntime, runServer } from "./runtime.effect";
import { AppConfig, requireAppName } from "./services.effect";

describe("appRuntime", () => {
  it("resolves the example service through the app runtime", async () => {
    const appName = await appRuntime.runPromise(
      Effect.gen(function* () {
        const config = yield* AppConfig;
        return config.appName;
      })
    );

    expect(appName).toBe("psn-playtime");
  });

  it("recovers tagged failures from the typed error channel", async () => {
    const reason = await appRuntime.runPromise(
      requireAppName("xbox").pipe(
        Effect.catchTag("AppConfigError", (error) => Effect.succeed(error.reason))
      )
    );

    expect(reason).toBe("expected xbox, received psn-playtime");
  });

  it("builds an isolated runtime that disposes cleanly", async () => {
    const runtime = ManagedRuntime.make(AppLayer);
    onTestFinished(() => runtime.dispose());

    const appName = await runtime.runPromise(requireAppName("psn-playtime"));

    expect(appName).toBe("psn-playtime");
  });
});

describe(".runServer", () => {
  it("runs effects inside a server handler", async () => {
    const appName = await runServer(requireAppName("psn-playtime"));

    expect(appName).toBe("psn-playtime");
  });
});
