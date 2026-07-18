import { describe, expect, it } from "vitest";
import { normalizeNpsso } from "@/domain/npsso";

const token = "a".repeat(64);

describe(".normalizeNpsso", () => {
  it.each([
    ["the bare token", token, token],
    ["a quoted token", `"${token}"`, token],
    ["the full ssocookie JSON", `{"npsso":"${token}"}`, token],
    ["JSON with whitespace around the value", `{ "npsso": "${token}" }`, token],
    ["JSON with an unquoted key", `{npsso:"${token}"}`, token],
    ["surrounding whitespace", `  ${token}  `, token],
  ])("extracts the bare token from %s", (_label, input, expected) => {
    expect(normalizeNpsso(input)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["only whitespace", "   "],
    ["only braces and quotes", `{""}`],
  ])("returns an empty string for %s", (_label, input) => {
    expect(normalizeNpsso(input)).toBe("");
  });
});
