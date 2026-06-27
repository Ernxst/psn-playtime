import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  decodeHandoff,
  flattenApiTransactions,
  HANDOFF_COMPLETE_TYPE,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
  HANDOFF_RECEIVED_TYPE,
  type HandoffPayload,
  PLAYSTATION_ORIGIN,
  safeParseHandoff,
  type TransactionRow,
} from "@/lib/psn/transactions";
import { loadTransactionImport, saveTransactionImport } from "@/lib/transactions-store";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: ImportReceiver,
});

type Status = "reading" | "empty" | "invalid";
type SetCount = (count: number) => void;

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
 * {@link rowKey}, and persist the whole set incrementally. Returns the number
 * of newly added rows (0 when the batch was entirely duplicates).
 */
function appendBatch(acc: Accumulator, payload: HandoffPayload): number {
  let added = 0;
  for (const tx of flattenApiTransactions(payload.transactions)) if (mergeRow(acc, tx)) added += 1;
  if (acc.source === "") acc.source = payload.source;
  if (added > 0) {
    saveTransactionImport({
      transactions: acc.transactions,
      importedAt: new Date().toISOString(),
      source: acc.source,
    });
  }
  return added;
}

/**
 * Validate an untrusted `message` event as a handoff. Accepts only the exact
 * PlayStation origin and message type, then re-validates the payload shape
 * through the shared parser. Returns the payload, or `null` to ignore the event.
 */
export function readHandoffMessage(event: MessageEvent): HandoffPayload | null {
  if (event.origin !== PLAYSTATION_ORIGIN) return null;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null) return null;
  if ((data as { type?: unknown }).type !== HANDOFF_MESSAGE_TYPE) return null;
  return safeParseHandoff((data as { payload?: unknown }).payload);
}

/** Whether an untrusted event is the opener's end-of-stream "complete" signal. */
export function isHandoffComplete(event: MessageEvent): boolean {
  if (event.origin !== PLAYSTATION_ORIGIN) return false;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null) return false;
  return (data as { type?: unknown }).type === HANDOFF_COMPLETE_TYPE;
}

/** Handle one streamed batch (or the complete signal) from the opener. */
function createMessageHandler(acc: Accumulator, setCount: SetCount, onComplete: () => void) {
  return (event: MessageEvent) => {
    if (isHandoffComplete(event)) {
      onComplete();
      return;
    }
    const payload = readHandoffMessage(event);
    if (!payload) return;
    appendBatch(acc, payload);
    setCount(acc.transactions.length);
    // Acknowledge so the opener knows the receiver is alive and persisting.
    if (window.opener) {
      window.opener.postMessage({ type: HANDOFF_RECEIVED_TYPE }, event.origin);
    }
  };
}

/** Persist the one-shot fragment fallback payload. */
function persistFragment(acc: Accumulator, payload: HandoffPayload, setCount: SetCount): Status {
  if (flattenApiTransactions(payload.transactions).length === 0) return "invalid";
  appendBatch(acc, payload);
  setCount(acc.transactions.length);
  // Clear the (potentially large) fragment from the address bar.
  window.history.replaceState(null, "", window.location.pathname);
  toast.success(`Imported ${acc.transactions.length} transactions from your PlayStation history.`);
  return "reading";
}

interface Bootstrap {
  onImported: () => void;
  setStatus: (status: Status) => void;
  setCount: SetCount;
}

/** Kick off the handoff once mounted: fragment fallback, ready ping, or empty. */
function bootstrap(acc: Accumulator, { onImported, setStatus, setCount }: Bootstrap): void {
  setCount(acc.transactions.length);

  const fragmentPayload = decodeHandoff(window.location.hash);
  if (fragmentPayload) {
    const next = persistFragment(acc, fragmentPayload, setCount);
    setStatus(next);
    if (next === "reading") onImported();
    return;
  }

  if (window.opener) {
    // Tell the opener we are ready to receive its streamed handoff.
    window.opener.postMessage({ type: HANDOFF_READY_TYPE }, "*");
    return;
  }

  if (acc.transactions.length === 0) setStatus("empty");
}

interface ReceiverState {
  status: Status;
  /** Transactions imported so far across all streamed batches. */
  count: number;
}

/** Drive the handoff: fragment fallback, otherwise the streamed postMessage. */
function useHandoffReceiver(): ReceiverState {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("reading");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const goToDashboard = () => void navigate({ to: "/dashboard" });
    const acc = seedAccumulator();
    const onMessage = createMessageHandler(acc, setCount, goToDashboard);
    window.addEventListener("message", onMessage);
    bootstrap(acc, { onImported: goToDashboard, setStatus, setCount });
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return { status, count };
}

/**
 * Receives the bookmarklet handoff. The primary path is a stream of
 * `postMessage` batches from the opener (the PlayStation order page) — each
 * accepted only from {@link PLAYSTATION_ORIGIN}, re-validated through the shared
 * parser, de-duped, and appended live with a running progress count. The
 * URL-fragment path is the one-shot fallback for when popups are blocked. Both
 * persist to localStorage; the dashboard route follows once the import lands.
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
              {count} transactions imported so far
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
  return "Reading the transactions handed over from PlayStation. Rows appear here as they load.";
}
