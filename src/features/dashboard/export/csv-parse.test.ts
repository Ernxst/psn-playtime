import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse";

describe("parseCsv", () => {
  it("keys each row by the header cells", () => {
    const { headers, rows } = parseCsv("a,b,c\r\n1,2,3");

    expect(headers).toStrictEqual(["a", "b", "c"]);
    expect(rows).toStrictEqual([{ a: "1", b: "2", c: "3" }]);
  });

  it("yields no rows for a header-only document", () => {
    expect(parseCsv("a,b").rows).toStrictEqual([]);
  });

  it("yields empty headers and no rows for an empty document", () => {
    expect(parseCsv("")).toStrictEqual({ headers: [], rows: [] });
  });

  it("unwraps a quoted field containing a comma", () => {
    const { rows } = parseCsv('name,hours\r\n"Ratchet & Clank, Rift Apart",5');

    expect(rows[0]).toStrictEqual({ name: "Ratchet & Clank, Rift Apart", hours: "5" });
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    const { rows } = parseCsv('name\r\n"The ""Best"" Game"');

    expect(rows[0]?.name).toBe('The "Best" Game');
  });

  it("keeps a newline inside a quoted field", () => {
    const { rows } = parseCsv('note\r\n"line one\nline two"');

    expect(rows[0]?.note).toBe("line one\nline two");
  });

  it("accepts LF-only line endings", () => {
    const { rows } = parseCsv("a,b\n1,2\n3,4");

    expect(rows).toStrictEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("defaults a missing trailing cell to an empty string", () => {
    expect(parseCsv("a,b,c\r\n1,2").rows[0]).toStrictEqual({ a: "1", b: "2", c: "" });
  });

  it("does not emit a phantom row for a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toHaveLength(1);
  });
});
