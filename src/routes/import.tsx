import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ImportPending,
  ImportReceiver,
  receiveHandoff,
} from "@/features/import/components/import-receiver";
import type { DashboardStore } from "@/stores/dashboard-store";
import type { TransactionStore } from "@/stores/transactions-store";

/**
 * Read the bookmarklet handoff from this tab's URL fragment, persist it, then
 * redirect to the dashboard. Runs client-side (`ssr: false`) because the
 * fragment is never sent to the server. Persists through the per-request
 * transaction store on the loader's `context` (which closes over the same atom
 * registry the React hooks read). Returns the empty/invalid view state when the
 * page was opened without a usable handoff.
 */
export function loadHandoff({
  context,
}: {
  context: { dashboardStore: DashboardStore; transactionStore: TransactionStore };
}) {
  const result = receiveHandoff(context.transactionStore, context.dashboardStore);
  if (result.status === "imported") {
    context.dashboardStore.setActive(result.accountId);
    toast.success(`Imported ${result.count} transactions from your PlayStation history.`);
    throw redirect({ to: "/dashboard" });
  }
  return result;
}

export const Route = createFileRoute("/import")({
  ssr: false,
  loader: loadHandoff,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: ImportReceiver,
  pendingComponent: ImportPending,
});
