import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/lib/psn/mock";
import { AccountProvider, type AccountCredential } from "./account-provider.effect";
import { type GameEnrichment, EnrichmentProvider } from "./enrichment-provider.effect";
import {
  AccountAuthError,
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
  loadDashboard: (credential: AccountCredential) =>
    Redacted.value(credential) === VALID
      ? Effect.succeed(demoDashboard)
      : Effect.fail(new AccountAuthError({ reason: "rejected" })),
});

const ENRICHED: GameEnrichment = { genre: "RPG", typicalPlaytime: 40 };

/**
 * A stand-in enrichment source: a known title resolves to a `GameEnrichment`,
 * one title rate-limits, everything else is upstream-unavailable.
 */
const enrichmentTestLayer = Layer.succeed(EnrichmentProvider, {
  lookupGameInfo: (title: string) => {
    if (title === "Known Game") return Effect.succeed(ENRICHED);
    if (title === "Busy Game")
      return Effect.fail(new ProviderRateLimitedError({ provider: "test" }));
    return Effect.fail(new ProviderUnavailableError({ provider: "test", reason: "503" }));
  },
  lookupFranchise: () => Effect.succeed(undefined),
});

describe("E3 service ports", () => {
  it("resolves a DashboardData through the AccountProvider port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AccountProvider;
      return yield* provider.loadDashboard(Redacted.make(VALID));
    });

    const data = await Effect.runPromise(program.pipe(Effect.provide(accountTestLayer)));

    expect(data.profile.onlineId).toBe(demoDashboard.profile.onlineId);
  });

  it("recovers AccountAuthError on the typed channel", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AccountProvider;
      return yield* provider.loadDashboard(Redacted.make("stale"));
    }).pipe(
      Effect.catchTag("AccountAuthError", (error) => Effect.succeed(error.reason)),
      Effect.provide(accountTestLayer)
    );

    expect(await Effect.runPromise(program)).toBe("rejected");
  });

  it("resolves a GameEnrichment through the EnrichmentProvider port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* EnrichmentProvider;
      return yield* provider.lookupGameInfo("Known Game");
    });

    const info = await Effect.runPromise(program.pipe(Effect.provide(enrichmentTestLayer)));

    expect(info).toEqual(ENRICHED);
  });

  it("recovers both EnrichmentProvider error tags on the typed channel", async () => {
    const lookup = (title: string) =>
      Effect.gen(function* () {
        const provider = yield* EnrichmentProvider;
        return yield* provider.lookupGameInfo(title);
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
