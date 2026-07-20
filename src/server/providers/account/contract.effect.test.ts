import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import { CredentialRejectedError } from "../errors.effect";
import { DashboardSource, type AccountCredential } from "./contract.effect";

/**
 * Proves the `DashboardSource` port and its tagged errors compose: a trivial
 * in-memory layer implements the port, an Effect consumes it, and a tagged
 * failure is recovered on the typed channel.
 */

const VALID = "valid-token";

/** A stand-in account source: a known credential succeeds, anything else fails auth. */
const accountTestLayer = Layer.succeed(DashboardSource, {
  loadDashboard: (credential: AccountCredential) =>
    Redacted.value(credential) === VALID
      ? Effect.succeed(demoDashboard)
      : Effect.fail(new CredentialRejectedError({ reason: "rejected" })),
});

describe("DashboardSource", () => {
  it("resolves a DashboardData through the DashboardSource port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* DashboardSource;
      return yield* provider.loadDashboard(Redacted.make(VALID));
    });

    const data = await Effect.runPromise(program.pipe(Effect.provide(accountTestLayer)));

    expect(data.profile.onlineId).toBe(demoDashboard.profile.onlineId);
  });

  it("recovers CredentialRejectedError on the typed channel", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* DashboardSource;
      return yield* provider.loadDashboard(Redacted.make("stale"));
    }).pipe(
      Effect.catchTag("CredentialRejectedError", (error) => Effect.succeed(error.reason)),
      Effect.provide(accountTestLayer)
    );

    await expect(Effect.runPromise(program)).resolves.toBe("rejected");
  });
});
