import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { decodeHandoff, parseTransactions } from "@/lib/psn/transactions";
import { saveTransactionImport } from "@/lib/transactions-store";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: ImportReceiver,
});

type Status = "reading" | "empty" | "invalid";

/**
 * Read the handoff from the URL fragment and persist it. The fragment is
 * client-side only, so the scraped rows never reach the server. Returns
 * `"reading"` on success (caller routes onward) or the failure status.
 */
function persistImport(): Status {
  const payload = decodeHandoff(window.location.hash);
  if (!payload) return "empty";

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
 * Receives the bookmarklet handoff. Valid imports are persisted to localStorage
 * and the user is sent to the dashboard; failures explain how to retry.
 */
export function ImportReceiver() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("reading");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const next = persistImport();
    setStatus(next);
    if (next === "reading") void navigate({ to: "/dashboard" });
  }, [navigate]);

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
