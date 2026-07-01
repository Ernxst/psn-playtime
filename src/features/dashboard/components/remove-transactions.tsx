import { useRouteContext } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTransactionImport } from "@/stores/transactions-store";

/**
 * Destructive control that drops the imported PSN transaction data (the spend
 * import) via `transactionStore.clear()`. It touches only the persisted import,
 * never an account's cached games or dashboard snapshot.
 *
 * Hidden until an import exists, and gated behind a two-step confirm so a single
 * stray click cannot wipe the data — matching the repo's inline confirmation
 * idiom rather than pulling in a dialog primitive.
 */
function ConfirmActions({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex shrink-0 gap-2">
      <Button variant="destructive" size="sm" onClick={onConfirm}>
        Confirm remove
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export function RemoveTransactions() {
  const imported = useTransactionImport();
  const { transactionStore } = useRouteContext({ from: "__root__" });
  const [confirming, setConfirming] = useState(false);

  if (!imported || imported.transactions.length === 0) return null;

  function remove() {
    transactionStore.clear();
    setConfirming(false);
    toast.success("Removed your imported transaction data.");
  }

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Trash2 className="size-4 shrink-0" aria-hidden="true" />
            Remove imported transaction data
          </p>
          <p className="text-xs text-muted-foreground">
            Clears the imported spend only. Your games and dashboard stay untouched.
          </p>
        </div>
        {confirming ? (
          <ConfirmActions onConfirm={remove} onCancel={() => setConfirming(false)} />
        ) : (
          <Button
            variant="destructive-outline"
            size="sm"
            className="shrink-0"
            onClick={() => setConfirming(true)}
          >
            Remove
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
