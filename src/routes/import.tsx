import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  decodeHandoff,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
  HANDOFF_RECEIVED_TYPE,
  type HandoffPayload,
  parseTransactions,
  PLAYSTATION_ORIGIN,
  safeParseHandoff,
} from "@/lib/psn/transactions";
import { saveTransactionImport } from "@/lib/transactions-store";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: ImportReceiver,
});

type Status = "reading" | "empty" | "invalid";

/**
 * Parse and persist a handoff payload (from either the URL fragment or a
 * `postMessage`). The payload is already shape-validated; the rows are still
 * untrusted text. Returns `"reading"` on success or the failure status.
 */
function persistPayload(payload: HandoffPayload): Status {
  const transactions = parseTransactions(payload.rows);
  if (transactions.length === 0) return "invalid";

  saveTransactionImport({
    transactions,
    importedAt: new Date().toISOString(),
    source: payload.source,
  });
  // Clear the (potentially large) fragment from the address bar.
  window.history.replaceState(null, "", window.location.pathname);
  toast.success(`Imported ${transactions.length} transactions from your PlayStation history.`);
  return "reading";
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

/** Drive the handoff: fragment fallback, otherwise the postMessage handshake. */
function useHandoffReceiver(): Status {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("reading");
  const handled = useRef(false);

  useEffect(() => {
    const finish = (next: Status) => {
      handled.current = true;
      setStatus(next);
      if (next === "reading") void navigate({ to: "/dashboard" });
    };

    const onMessage = (event: MessageEvent) => {
      if (handled.current) return;
      const payload = readHandoffMessage(event);
      if (!payload) return;
      const next = persistPayload(payload);
      // Acknowledge so the opener stops retrying / falling back.
      if (next === "reading" && window.opener) {
        window.opener.postMessage({ type: HANDOFF_RECEIVED_TYPE }, event.origin);
      }
      finish(next);
    };

    window.addEventListener("message", onMessage);

    const fragmentPayload = decodeHandoff(window.location.hash);
    if (fragmentPayload) {
      finish(persistPayload(fragmentPayload));
    } else if (window.opener) {
      // Tell the opener we are ready to receive its postMessage handoff.
      window.opener.postMessage({ type: HANDOFF_READY_TYPE }, "*");
    } else {
      finish("empty");
    }

    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return status;
}

/**
 * Receives the bookmarklet handoff. The primary path is a `postMessage` from the
 * opener (the PlayStation order page) — accepted only from {@link PLAYSTATION_ORIGIN}
 * and re-validated through the shared parser. The URL-fragment path is the
 * fallback for when popups are blocked. Both persist to localStorage and route to
 * the dashboard; failures explain how to retry.
 */
export function ImportReceiver() {
  const status = useHandoffReceiver();

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
          <CardContent className="flex justify-center">
            <Spinner />
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}

function description(status: Status): string {
  if (status === "empty") {
    return "Open this page by running the transaction-history bookmarklet on your PlayStation order page. There was no import data in the link.";
  }
  if (status === "invalid") {
    return "We couldn't read any transactions from that link. Re-run the bookmarklet on your PlayStation order history and try again.";
  }
  return "Reading the transactions handed over from your PlayStation order page.";
}
