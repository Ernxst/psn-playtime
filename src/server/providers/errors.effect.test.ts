import { describe, expect, it } from "vitest";
import {
  CredentialRejectedError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
  providerError,
} from "./errors.effect";

describe("CredentialRejectedError", () => {
  it("carries its tag and reason", () => {
    const error = new CredentialRejectedError({ reason: "expired token" });

    expect(error._tag).toBe("CredentialRejectedError");
    expect(error.reason).toBe("expired token");
  });

  it("is an Error instance so it can be thrown and caught", () => {
    expect(new CredentialRejectedError({ reason: "nope" })).toBeInstanceOf(Error);
  });
});

describe("ProviderUnavailableError", () => {
  it("carries its tag, provider and a stable sanitised reason code", () => {
    const error = new ProviderUnavailableError({ provider: "psn", reason: "upstream_error" });

    expect(error._tag).toBe("ProviderUnavailableError");
    expect(error.provider).toBe("psn");
    expect(error.reason).toBe("upstream_error");
  });
});

describe("ProviderRateLimitedError", () => {
  it("carries its tag and provider", () => {
    const error = new ProviderRateLimitedError({ provider: "rawg" });

    expect(error._tag).toBe("ProviderRateLimitedError");
    expect(error.provider).toBe("rawg");
  });
});

describe(".providerError", () => {
  it.each([
    ["HTTP 429 Too Many Requests"],
    ["too many requests, slow down"],
    ["upstream rate limit reached"],
    ["RATE LIMIT exceeded"],
  ])(
    "classifies a message signalling rate limiting (%s) as ProviderRateLimitedError",
    (message) => {
      const error = providerError("psn")(new Error(message));

      expect(error).toBeInstanceOf(ProviderRateLimitedError);
      expect(error).toMatchObject({ _tag: "ProviderRateLimitedError", provider: "psn" });
    }
  );

  it("classifies an unrelated failure as ProviderUnavailableError with the stable reason code", () => {
    const error = providerError("rawg")(new Error("connection refused"));

    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({
      _tag: "ProviderUnavailableError",
      provider: "rawg",
      reason: "upstream_error",
    });
  });

  it("keeps raw upstream text (a URL/token) out of the typed reason, retaining it only as cause", () => {
    const leaky = new Error("GET https://api.example.com?token=SECRET-abc123 failed: 500");
    const error = providerError("psn")(leaky);

    expect(error).toBeInstanceOf(ProviderUnavailableError);
    if (!(error instanceof ProviderUnavailableError)) throw new Error("expected unavailable");
    expect(error.reason).toBe("upstream_error");
    expect(error.reason).not.toContain("https://");
    expect(error.reason).not.toContain("SECRET-abc123");
    expect(error.cause).toBe(leaky);
  });

  it("retains a non-Error thrown value as cause without surfacing it in the reason", () => {
    const error = providerError("psn")("plain string failure");

    expect(error).toBeInstanceOf(ProviderUnavailableError);
    if (!(error instanceof ProviderUnavailableError)) throw new Error("expected unavailable");
    expect(error.reason).toBe("upstream_error");
    expect(error.cause).toBe("plain string failure");
  });

  it("binds the provider name once for reuse as a catch thunk", () => {
    const classify = providerError("psn");

    expect(classify(new Error("boom"))).toMatchObject({
      provider: "psn",
      reason: "upstream_error",
    });
    expect(classify(new Error("429"))).toMatchObject({
      _tag: "ProviderRateLimitedError",
      provider: "psn",
    });
  });
});
