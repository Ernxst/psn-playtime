import { describe, expect, it } from "vitest";
import { SITE_NAME, SITE_URL } from "./seo";

describe("seo constants", () => {
  it("exposes the canonical site origin", () => {
    expect(SITE_URL).toBe("https://psn.ernestbadu.dev");
  });

  it("exposes the human-readable site name", () => {
    expect(SITE_NAME).toBe("PSN Playtime");
  });
});
