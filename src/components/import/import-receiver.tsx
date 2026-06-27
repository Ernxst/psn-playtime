import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { decodeHandoff, type HandoffPayload, type TransactionRow } from "@/lib/psn/transactions";
import { loadTransactionImport, saveTransactionImport } from "@/lib/transactions-store";

type Status = "reading" | "empty" | "invalid";

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

interface ReceiverState {
  status: Status;
  /** Transactions held after the import. */
  count: number;
}

/**
 * Read + persist this tab's fragment handoff and return the resulting view
 * state. Calls {@link onImported} (and clears the fragment) only on a successful
 * import. Pure of React so the effect needs a single `setState`.
 */
function receiveHandoff(onImported: () => void): ReceiverState {
  const acc = seedAccumulator();
  const payload = decodeHandoff(window.location.hash);

  if (!payload) return { status: "empty", count: acc.transactions.length };
  if (payload.transactions.length === 0) return { status: "invalid", count: 0 };

  appendPayload(acc, payload);
  // Clear the (large) fragment from the address bar before navigating.
  window.history.replaceState(null, "", window.location.pathname);
  toast.success(`Imported ${acc.transactions.length} transactions from your PlayStation history.`);
  onImported();
  return { status: "reading", count: acc.transactions.length };
}

/**
 * Read the handoff the bookmarklet placed in this tab's own URL fragment,
 * validate + de-dupe + persist it, then move on to the dashboard. The fragment
 * is the sole transport: the app's `Cross-Origin-Opener-Policy: same-origin`
 * severs `window.opener`, so cross-window messaging from the PlayStation tab can
 * never reach here.
 */
function useHandoffReceiver(): ReceiverState {
  const navigate = useNavigate();
  const [state, setState] = useState<ReceiverState>({ status: "reading", count: 0 });

  useEffect(() => {
    setState(receiveHandoff(() => void navigate({ to: "/dashboard" })));
  }, [navigate]);

  return state;
}

/**
 * Receives the bookmarklet handoff from this tab's URL fragment, validates it
 * through the shared parser, de-dupes against any prior import, persists it to
 * localStorage, and continues to the dashboard. Shows an empty/invalid state
 * when the page is opened without a usable handoff.
 */
export function ImportReceiver() {
  const { status, count } = useHandoffReceiver();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {status === "reading" ? "Importing your spend…" : "Nothing to import"}
          </CardTitle>
          <CardDescription>{description(status)}</CardDescription>
        </CardHeader>
        {status === "reading" ? (
          <CardContent className="flex flex-col items-center gap-3">
            <Spinner />
            <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
              {count} transactions imported
            </p>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}

function description(status: Status): string {
  if (status === "empty") {
    return "Open this page by running the transaction-history bookmarklet while signed in to PlayStation. There was no import data in the link.";
  }
  if (status === "invalid") {
    return "We couldn't read any transactions from that link. Re-run the bookmarklet while signed in to PlayStation and try again.";
  }
  return "Reading the transactions handed over from PlayStation.";
}
