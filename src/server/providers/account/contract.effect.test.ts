import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import { CredentialRejectedError } from "../errors.effect";
import { AccountProvider, type AccountCredential } from "./contract.effect";

/**
 * Proves the E3 AccountProvider port tag and its tagged errors compose: a
 * trivial in-memory layer implements the port, an Effect consumes it, and a
 * tagged failure is recovered on the typed channel. Also keeps the port
 * referenced for knip.
 */

const VALID = "valid-token";

/** A stand-in account source: a known credential succeeds, anything else fails auth. */
const accountTestLayer = Layer.succeed(AccountProvider, {
  fetchSnapshot: (credential: AccountCredential) =>
    Redacted.value(credential) === VALID
      ? Effect.succeed(demoDashboard)
      : Effect.fail(new CredentialRejectedError({ reason: "rejected" })),
});

describe("E3 service ports", () => {
  it("resolves a DashboardData through the AccountProvider port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AccountProvider;
      return yield* provider.fetchSnapshot(Redacted.make(VALID));
    });

    const data = await Effect.runPromise(program.pipe(Effect.provide(accountTestLayer)));

    expect(data.profile.onlineId).toBe(demoDashboard.profile.onlineId);
  });

  it("recovers CredentialRejectedError on the typed channel", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AccountProvider;
      return yield* provider.fetchSnapshot(Redacted.make("stale"));
    }).pipe(
      Effect.catchTag("CredentialRejectedError", (error) => Effect.succeed(error.reason)),
      Effect.provide(accountTestLayer)
    );

    expect(await Effect.runPromise(program)).toBe("rejected");
  });
});
