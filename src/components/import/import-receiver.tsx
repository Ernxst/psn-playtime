import { getRouteApi } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { decodeHandoff, type HandoffPayload, type TransactionRow } from "@/domain/transactions";
import { loadTransactionImport, saveTransactionImport } from "@/lib/transactions-store";

/** A running, de-duped accumulation of imported transactions. */
interface Accumulator {
  seen: Set<string>;
  transactions: TransactionRow[];
  source: string;
}

/** Add a transaction unless its stable {@link TransactionRow.key} was seen. */
function mergeRow(acc: Accumulator, tx: TransactionRow): boolean {
  if (acc.seen.has(tx.key)) return false;
  acc.seen.add(tx.key);
  acc.transactions.push(tx);
  return true;
}

/** Seed the accumulator from any already-persisted import so re-runs append. */
function seedAccumulator(): Accumulator {
  const acc: Accumulator = { seen: new Set(), transactions: [], source: "" };
  const existing = loadTransactionImport();
  if (!existing) return acc;
  acc.source = existing.source;
  for (const tx of existing.transactions) mergeRow(acc, tx);
  return acc;
}

/**
 * Merge a handoff payload's rows into the accumulator, de-duping by
 * {@link TransactionRow.key}, and persist the whole set. Returns the number of
 * newly added rows (0 when every row was already present).
 */
function appendPayload(acc: Accumulator, payload: HandoffPayload): number {
  let added = 0;
  for (const tx of payload.transactions) if (mergeRow(acc, tx)) added += 1;
  if (acc.source === "") acc.source = payload.source;
  saveTransactionImport({
    transactions: acc.transactions,
    importedAt: new Date().toISOString(),
    source: acc.source,
  });
  return added;
}

/** Outcome of reading this tab's fragment handoff. */
export type HandoffResult =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "imported"; count: number };

/** The view states the receiver renders when it does not redirect. */
type Settled = Exclude<HandoffResult, { status: "imported" }>["status"];

/**
 * Read the handoff the bookmarklet placed in this tab's own URL fragment,
 * validate + de-dupe + persist it, then report what to do next. The fragment is
 * the sole transport: the app's `Cross-Origin-Opener-Policy: same-origin` severs
 * `window.opener`, so cross-window messaging from the PlayStation tab can never
 * reach here. Runs in the `/import` route loader (client-only via `ssr: false`),
 * so the address bar's fragment is readable; `imported` tells the loader to
 * redirect to the dashboard.
 */
export function receiveHandoff(): HandoffResult {
  const acc = seedAccumulator();
  const payload = decodeHandoff(window.location.hash);

  if (!payload) return { status: "empty" };
  if (payload.transactions.length === 0) return { status: "invalid" };

  appendPayload(acc, payload);
  // Clear the (large) fragment from the address bar before redirecting.
  window.history.replaceState(null, "", window.location.pathname);
  return { status: "imported", count: acc.transactions.length };
}

const route = getRouteApi("/import");

/**
 * Renders the outcome of the `/import` loader's fragment handoff. A successful
 * import redirects to the dashboard from the loader, so this only ever shows the
 * empty/invalid state when the page was opened without a usable handoff.
 */
export function ImportReceiver() {
  const { status } = route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Nothing to import</CardTitle>
          <CardDescription>{description(status)}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

/** Shown while the `/import` loader reads and persists the fragment handoff. */
export function ImportPending() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Importing your spend…</CardTitle>
          <CardDescription>Reading the transactions handed over from PlayStation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Spinner />
        </CardContent>
      </Card>
    </main>
  );
}

function description(status: Settled): string {
  if (status === "empty") {
    return "Open this page by running the transaction-history bookmarklet while signed in to PlayStation. There was no import data in the link.";
  }
  return "We couldn't read any transactions from that link. Re-run the bookmarklet while signed in to PlayStation and try again.";
}
