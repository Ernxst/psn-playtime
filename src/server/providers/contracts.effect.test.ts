import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import { AccountProvider, type AccountCredential } from "./account/contract.effect";
import { type GameMetadata, EnrichmentProvider } from "./enrichment/contract.effect";
import {
  CredentialRejectedError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
} from "./errors.effect";

/**
 * Proves the E3 port tags and tagged errors compose: trivial in-memory layers
 * implement each port, an Effect consumes the port, and a tagged failure is
 * recovered on the typed channel. Also keeps the ports referenced for knip.
 */

const VALID = "valid-token";

/** A stand-in account source: a known credential succeeds, anything else fails auth. */
const accountTestLayer = Layer.succeed(AccountProvider, {
  fetchSnapshot: (credential: AccountCredential) =>
    Redacted.value(credential) === VALID
      ? Effect.succeed(demoDashboard)
      : Effect.fail(new CredentialRejectedError({ reason: "rejected" })),
});

const ENRICHED: GameMetadata = { genre: "RPG", typicalPlaytime: 40 };

/**
 * A stand-in enrichment source: a known title resolves to a `GameMetadata`,
 * one title rate-limits, everything else is upstream-unavailable.
 */
const enrichmentTestLayer = Layer.succeed(EnrichmentProvider, {
  fetchGameMetadata: (title: string) => {
    if (title === "Known Game") return Effect.succeed(ENRICHED);
    if (title === "Busy Game")
      return Effect.fail(new ProviderRateLimitedError({ provider: "test" }));
    return Effect.fail(new ProviderUnavailableError({ provider: "test", reason: "503" }));
  },
  fetchFranchise: () => Effect.succeed(undefined),
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

  it("resolves a GameMetadata through the EnrichmentProvider port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* EnrichmentProvider;
      return yield* provider.fetchGameMetadata("Known Game");
    });

    const info = await Effect.runPromise(program.pipe(Effect.provide(enrichmentTestLayer)));

    expect(info).toEqual(ENRICHED);
  });

  it("recovers both EnrichmentProvider error tags on the typed channel", async () => {
    const lookup = (title: string) =>
      Effect.gen(function* () {
        const provider = yield* EnrichmentProvider;
        return yield* provider.fetchGameMetadata(title);
      }).pipe(
        Effect.catchTags({
          ProviderRateLimitedError: (error) => Effect.succeed(`rate:${error.provider}`),
          ProviderUnavailableError: (error) => Effect.succeed(`down:${error.reason}`),
        }),
        Effect.provide(enrichmentTestLayer)
      );

    expect(await Effect.runPromise(lookup("Busy Game"))).toBe("rate:test");
    expect(await Effect.runPromise(lookup("Other Game"))).toBe("down:503");
  });
});
