import { format, parseISO } from "date-fns";

/** "1,253.6 h" style hour label. */
export function fmtHours(hours: number): string {
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: hours < 10 ? 1 : 0 })} h`;
}

export function fmtNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Plain-English date, tolerant of missing/invalid values. */
export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return "—";
  }
}

/** "≈ 320 days" or "≈ 0.9 years" for big hour totals. */
export function fmtDuration(hours: number): string {
  const days = hours / 24;
  if (days >= 365) {
    return `${(days / 365).toLocaleString(undefined, { maximumFractionDigits: 1 })} years`;
  }
  return `${days.toLocaleString(undefined, { maximumFractionDigits: 0 })} days`;
}

/** Stable colour palette for categorical charts (cycles the 5 chart vars). */
export function chartColor(i: number): string {
  return `var(--chart-${(i % 5) + 1})`;
}
