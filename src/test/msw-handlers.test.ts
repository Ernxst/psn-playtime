import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { TRANSACTION_HISTORY_ENDPOINT } from "@/domain/transaction-bookmarklet";
import { server } from "./msw";
import {
  PSN_PLAYED_GAMES_URL,
  PSN_PROFILE_URL,
  PSN_TROPHY_TITLES_URL,
  psnAuthUrl,
  rawgUrl,
  withTransactionCredentials,
} from "./msw-handlers";

const psnRequests = [
  [psnAuthUrl("authorize"), { headers: { cookie: "npsso=test-token" }, redirect: "manual" }, 302],
  [psnAuthUrl("token"), { method: "POST", headers: { authorization: "Basic test-client" } }, 200],
  [PSN_PROFILE_URL, { headers: { authorization: "Bearer access-token" } }, 200],
  [PSN_PLAYED_GAMES_URL, { headers: { authorization: "Bearer access-token" } }, 200],
  [PSN_TROPHY_TITLES_URL, { headers: { authorization: "Bearer access-token" } }, 200],
] as const;

const rawgRequests = [rawgUrl("games"), rawgUrl("games/42/game-series")];

const transactionHeaders = {
  "apollographql-client-name": "@sie-ppr-web-checkout/app",
  "x-psn-storefront-type": "checkout:pdc",
  "x-psn-request-id": "request-id",
};

const invalidTransactionRequests = [
  { headers: transactionHeaders },
  {
    credentials: "include",
    headers: {
      "x-psn-storefront-type": "checkout:pdc",
      "x-psn-request-id": "request-id",
    },
  },
  {
    credentials: "include",
    headers: {
      "apollographql-client-name": "@sie-ppr-web-checkout/app",
      "x-psn-request-id": "request-id",
    },
  },
  {
    credentials: "include",
    headers: {
      "apollographql-client-name": "@sie-ppr-web-checkout/app",
      "x-psn-storefront-type": "checkout:pdc",
    },
  },
] as const;

describe(".psnAuthUrl", () => {
  it("builds PSN auth endpoints from the PSN auth base", () => {
    expect(psnAuthUrl("authorize")).toBe(
      "https://ca.account.sony.com/api/authz/v3/oauth/authorize"
    );
    expect(psnAuthUrl("token")).toBe("https://ca.account.sony.com/api/authz/v3/oauth/token");
  });
});

describe(".rawgUrl", () => {
  it("builds RAWG endpoints from the RAWG API base", () => {
    expect(rawgUrl("games")).toBe("https://api.rawg.io/api/games");
    expect(rawgUrl("games/:id/game-series")).toBe("https://api.rawg.io/api/games/:id/game-series");
  });
});

describe("shared request policies", () => {
  it.each(psnRequests)("accepts an authenticated PSN request to %s", async (url, init, status) => {
    const response = await fetch(url, init);

    expect(response.status).toBe(status);
  });

  it.each(psnRequests)("rejects an unauthenticated PSN request to %s", async (url, init) => {
    const method = "method" in init ? init.method : "GET";
    const response = await fetch(url, { method, redirect: "manual" });

    expect(response.status).toBe(401);
  });

  it.each(rawgRequests)("accepts the expected RAWG key at %s", async (url) => {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set("key", "test-key");

    const response = await fetch(requestUrl);

    expect(response.ok).toBe(true);
  });

  it.each(rawgRequests)("rejects a missing RAWG key at %s", async (url) => {
    const response = await fetch(url);

    expect(response.status).toBe(403);
  });

  it("composes an authenticated transaction scenario resolver", async () => {
    const scenario = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(http.get(TRANSACTION_HISTORY_ENDPOINT, withTransactionCredentials(scenario)));

    const response = await fetch(TRANSACTION_HISTORY_ENDPOINT, {
      credentials: "include",
      headers: transactionHeaders,
    });

    expect(response.status).toBe(204);
    expect(scenario).toHaveBeenCalledTimes(1);
  });

  it.each(invalidTransactionRequests)(
    "rejects incomplete transaction request input",
    async (init) => {
      const response = await fetch(TRANSACTION_HISTORY_ENDPOINT, init);

      expect(response.status).toBe(401);
    }
  );
});
