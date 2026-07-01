/**
 * A small RFC-4180 CSV parser, the inverse of the `csv.ts` serialisation.
 *
 * The exporters build CSVs by quoting any cell containing a comma, quote, or
 * newline and escaping an embedded `"` as `""`; this parser reverses exactly
 * that. The first record is the header row, and every subsequent record becomes
 * an object keyed by header, so a caller can decode it with the header-keyed
 * `Schema.Struct`s in `csv-schema.effect.ts` regardless of column order.
 *
 * Records are separated by `\n` (a preceding `\r` in a CRLF pair is ignored
 * outside quotes); a field may span newlines only while quoted. Kept
 * dependency-free and pure so both the export feature and the importer share one
 * definition.
 */

/** The parsed CSV: the header cells, and each data row keyed by header. */
export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** The running scan state, threaded through the per-character feed helpers. */
interface Scan {
  records: string[][];
  record: string[];
  cell: string;
  quoted: boolean;
  /** Whether the current record has seen any character yet (guards a phantom final row). */
  open: boolean;
}

/** Close the current cell, appending it to the record in progress. */
function endCell(scan: Scan): void {
  scan.record.push(scan.cell);
  scan.cell = "";
}

/** Close the current record (and its final cell), starting a fresh record. */
function endRecord(scan: Scan): void {
  endCell(scan);
  scan.records.push(scan.record);
  scan.record = [];
  scan.open = false;
}

/** Feed one character while OUTSIDE quotes; returns how many extra chars to skip. */
function feedPlain(scan: Scan, char: string): number {
  scan.open = true;
  if (char === '"') {
    scan.quoted = true;
    return 0;
  }
  if (char === ",") {
    endCell(scan);
    return 0;
  }
  if (char === "\n") {
    endRecord(scan);
    return 0;
  }
  // A lone `\r` (the CR of a CRLF) is dropped; the following `\n` ends the record.
  if (char === "\r") return 0;
  scan.cell += char;
  return 0;
}

/** Feed one character while INSIDE quotes; returns how many extra chars to skip. */
function feedQuoted(scan: Scan, char: string, next: string): number {
  scan.open = true;
  if (char !== '"') {
    scan.cell += char;
    return 0;
  }
  // A doubled quote inside a quoted field is a literal quote; a lone one closes it.
  if (next === '"') {
    scan.cell += '"';
    return 1;
  }
  scan.quoted = false;
  return 0;
}

/** Feed one character, dispatching on whether the scan is inside quotes. */
function feed(scan: Scan, char: string, next: string): number {
  return scan.quoted ? feedQuoted(scan, char, next) : feedPlain(scan, char);
}

/** Flush a final record that did not end on a newline; a trailing newline emits none. */
function flush(scan: Scan): void {
  if (scan.open || scan.cell !== "" || scan.record.length > 0) endRecord(scan);
}

/** Scan `text` into records of raw string cells, honouring quotes and escapes. */
function splitRecords(text: string): string[][] {
  const scan: Scan = { records: [], record: [], cell: "", quoted: false, open: false };
  for (let i = 0; i < text.length; i++) {
    i += feed(scan, text[i] ?? "", text[i + 1] ?? "");
  }
  flush(scan);
  return scan.records;
}

/** Zip a record's cells onto the header keys, defaulting missing cells to `""`. */
function zip(headers: string[], cells: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = cells[index] ?? "";
  });
  return row;
}

/**
 * Parse `text` into a header list plus header-keyed rows. An empty document (or
 * one that is only a header row) yields no rows. Missing trailing cells default
 * to the empty string, so a row is always keyed by every header.
 */
export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text);
  const headers = records[0] ?? [];
  const rows = records.slice(1).map((cells) => zip(headers, cells));
  return { headers, rows };
}
