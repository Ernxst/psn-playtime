import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionRow } from "@/domain/transactions";
import {
  buildAccountCsv,
  buildGamesCsv,
  buildTransactionsCsv,
} from "@/features/dashboard/export/csv";
import type { DashboardData } from "@/server/providers/account/snapshot";

/** Sanitise a PSN onlineId for a filename, mirroring the prompt export. */
function safeId(onlineId: string): string {
  return onlineId.replace(/[^A-Za-z0-9-_]/g, "");
}

/** Download filename for the transactions CSV, tagged with the sanitised onlineId. */
function transactionsFileName(onlineId: string): string {
  const id = safeId(onlineId);
  return id === "" ? "psn-transactions.csv" : `psn-transactions-${id}.csv`;
}

/** Download filename for the games CSV, tagged with the sanitised onlineId. */
function gamesFileName(onlineId: string): string {
  const id = safeId(onlineId);
  return id === "" ? "psn-games.csv" : `psn-games-${id}.csv`;
}

/** Download filename for the account CSV, tagged with the sanitised onlineId. */
function accountFileName(onlineId: string): string {
  const id = safeId(onlineId);
  return id === "" ? "psn-account.csv" : `psn-account-${id}.csv`;
}

/** Download `csv` as a text/csv file via a transient object URL, then revoke it. */
function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The section heading for the export card. */
function ExportHeader() {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <Download className="size-4" /> Export your data
      </CardTitle>
      <CardDescription>
        Download your full game library, your account profile, and your imported transactions as
        CSV. The games and account files can restore your dashboard later.
      </CardDescription>
    </CardHeader>
  );
}

/**
 * Client-side CSV downloads for the dashboard: the full game library (one row per
 * title, games and apps), the account profile, and every imported transaction.
 * The games + account CSVs together reconstruct the whole `DashboardData` (see
 * `import-dashboard.ts`). Each file builds in the click handler and downloads via
 * a Blob object URL (no config, no server round-trip). The games/account buttons
 * are disabled for the empty demo library; the transactions button is disabled
 * when nothing was imported.
 */
export function ExportButtons({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions: readonly TransactionRow[];
}) {
  const onlineId = data.profile.onlineId;
  const hasLibrary = data.games.length > 0 || data.meta.appsExcluded.length > 0;

  const exportTransactions = () => {
    downloadCsv(buildTransactionsCsv(transactions), transactionsFileName(onlineId));
  };

  const exportGames = () => {
    downloadCsv(buildGamesCsv(data.games, data.meta.appsExcluded), gamesFileName(onlineId));
  };

  const exportAccount = () => {
    downloadCsv(buildAccountCsv(data.profile), accountFileName(onlineId));
  };

  return (
    <Card className="lg:col-span-3">
      <ExportHeader />
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={exportGames} disabled={!hasLibrary}>
          Export games (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportAccount} disabled={!hasLibrary}>
          Export account (CSV)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={exportTransactions}
          disabled={transactions.length === 0}
        >
          Export transactions (CSV)
        </Button>
      </CardContent>
    </Card>
  );
}
