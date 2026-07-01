import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse";

describe(".parseCsv", () => {
  it("reads the first line as headers and keys each later record by header name", () => {
    const { headers, rows } = parseCsv("a,b,c\r\n1,2,3\r\n4,5,6");

    expect(headers).toStrictEqual(["a", "b", "c"]);
    expect(rows).toStrictEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("unquotes a field containing a comma", () => {
    const { rows } = parseCsv('name,amount\r\n"Ratchet & Clank, Rift Apart",5999');

    expect(rows).toStrictEqual([{ name: "Ratchet & Clank, Rift Apart", amount: "5999" }]);
  });

  it("collapses a doubled quote inside a quoted field to a single quote", () => {
    const { rows } = parseCsv('name\r\n"The ""Best"" Game"');

    expect(rows).toStrictEqual([{ name: 'The "Best" Game' }]);
  });

  it("keeps a newline embedded inside a quoted field", () => {
    const { rows } = parseCsv('name\r\n"Line one\nline two"');

    expect(rows).toStrictEqual([{ name: "Line one\nline two" }]);
  });

  it.each([
    ["CRLF", "a,b\r\n1,2\r\n3,4"],
    ["LF", "a,b\n1,2\n3,4"],
  ])("splits records on %s line endings", (_label, text) => {
    const { rows } = parseCsv(text);

    expect(rows).toStrictEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("does not emit a trailing empty record for a document ending in a newline", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n");

    expect(rows).toStrictEqual([{ a: "1", b: "2" }]);
  });

  it("defaults a missing trailing cell to an empty string", () => {
    const { rows } = parseCsv("a,b,c\r\n1,2");

    expect(rows).toStrictEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("ignores cells beyond the declared headers", () => {
    const { rows } = parseCsv("a,b\r\n1,2,3");

    expect(rows).toStrictEqual([{ a: "1", b: "2" }]);
  });

  it("returns no rows for a header-only document", () => {
    const { headers, rows } = parseCsv("a,b,c");

    expect(headers).toStrictEqual(["a", "b", "c"]);
    expect(rows).toStrictEqual([]);
  });
});
