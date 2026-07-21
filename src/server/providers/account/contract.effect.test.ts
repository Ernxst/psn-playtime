import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import * as Psn from "@/test/factories/psn";
import { server } from "@/test/msw";
import { psnAuthUrl } from "@/test/msw-handlers";
import { DashboardSource } from "./contract.effect";
import { PsnDashboardSourceLayer } from "./psn/provider.effect";
import { PsnTransportLive } from "./psn/transport.effect";

const layer = Layer.provide(PsnDashboardSourceLayer, PsnTransportLive);

const loadDashboard = (credential: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* DashboardSource;
      return yield* source.loadDashboard(Redacted.make(credential));
    }).pipe(Effect.provide(layer))
  );

describe("DashboardSource", () => {
  it("loads dashboard data through the production PSN provider", async () => {
    const result = await loadDashboard("valid-token");

    expect(result.profile.onlineId).toBe(Psn.profile().profile.onlineId);
    expect(result.isDemo).toBe(false);
  });

  it("surfaces credential rejection from the production PSN provider", async () => {
    server.use(http.get(psnAuthUrl("authorize"), () => new HttpResponse(null, { status: 200 })));

    await expect(loadDashboard("stale-token")).rejects.toMatchObject({
      _tag: "CredentialRejectedError",
      reason: "npsso exchange rejected",
    });
  });
});
