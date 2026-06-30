import { describe, expect, it } from "vitest";
import {
  CredentialRejectedError,
  RateLimitedError,
  UpstreamUnavailableError,
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

describe("UpstreamUnavailableError", () => {
  it("carries its tag, provider and a stable sanitised reason code", () => {
    const error = new UpstreamUnavailableError({ provider: "psn", reason: "upstream_error" });

    expect(error._tag).toBe("UpstreamUnavailableError");
    expect(error.provider).toBe("psn");
    expect(error.reason).toBe("upstream_error");
  });
});

describe("RateLimitedError", () => {
  it("carries its tag and provider", () => {
    const error = new RateLimitedError({ provider: "rawg" });

    expect(error._tag).toBe("RateLimitedError");
    expect(error.provider).toBe("rawg");
  });
});

describe(".providerError", () => {
  it.each([
    ["HTTP 429 Too Many Requests"],
    ["too many requests, slow down"],
    ["upstream rate limit reached"],
    ["RATE LIMIT exceeded"],
  ])("classifies a message signalling rate limiting (%s) as RateLimitedError", (message) => {
    const error = providerError("psn")(new Error(message));

    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toMatchObject({ _tag: "RateLimitedError", provider: "psn" });
  });

  it("classifies an unrelated failure as UpstreamUnavailableError with the stable reason code", () => {
    const error = providerError("rawg")(new Error("connection refused"));

    expect(error).toBeInstanceOf(UpstreamUnavailableError);
    expect(error).toMatchObject({
      _tag: "UpstreamUnavailableError",
      provider: "rawg",
      reason: "upstream_error",
    });
  });

  it("keeps raw upstream text (a URL/token) off the typed error entirely, not just out of the reason", () => {
    const secret = "SECRET-abc123";
    const leaky = new Error(`GET https://api.example.com?token=${secret} failed: 500`);
    const error = providerError("psn")(leaky);

    expect(error).toBeInstanceOf(UpstreamUnavailableError);
    if (!(error instanceof UpstreamUnavailableError)) throw new Error("expected unavailable");
    expect(error.reason).toBe("upstream_error");

    // The raw thrown value must appear NOWHERE on the typed error — not in
    // `reason`, not in a `cause`, not in any other own field.
    expect(error).not.toHaveProperty("cause");
    const serialised = JSON.stringify(Object.entries(error));
    expect(serialised).not.toContain("https://");
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain("api.example.com");
  });

  it("discards a non-Error thrown value rather than surfacing it on the error", () => {
    const error = providerError("psn")("plain string failure");

    expect(error).toBeInstanceOf(UpstreamUnavailableError);
    if (!(error instanceof UpstreamUnavailableError)) throw new Error("expected unavailable");
    expect(error.reason).toBe("upstream_error");
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(Object.entries(error))).not.toContain("plain string failure");
  });

  it("binds the provider name once for reuse as a catch thunk", () => {
    const classify = providerError("psn");

    expect(classify(new Error("boom"))).toMatchObject({
      provider: "psn",
      reason: "upstream_error",
    });
    expect(classify(new Error("429"))).toMatchObject({
      _tag: "RateLimitedError",
      provider: "psn",
    });
  });
});
