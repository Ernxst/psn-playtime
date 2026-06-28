import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { ImportPending, ImportReceiver, receiveHandoff } from "@/components/import/import-receiver";

/**
 * Read the bookmarklet handoff from this tab's URL fragment, persist it, then
 * redirect to the dashboard. Runs client-side (`ssr: false`) because the
 * fragment is never sent to the server. Returns the empty/invalid view state
 * when the page was opened without a usable handoff.
 */
export function loadHandoff() {
  const result = receiveHandoff();
  if (result.status === "imported") {
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
