import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionRow } from "@/domain/transactions";
import { buildGamesCsv, buildTransactionsCsv } from "@/features/dashboard/export/csv";
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
        Download your imported transactions, and the games they matched, as CSV.
      </CardDescription>
    </CardHeader>
  );
}

/**
 * Two client-side CSV downloads for the imported data: every transaction, and
 * the subset joined to a library game. Both files build in the click handler and
 * download via a Blob object URL (no config, no server round-trip). The games
 * button is disabled when no transaction matched a library title.
 */
export function ExportButtons({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions: readonly TransactionRow[];
}) {
  const onlineId = data.profile.onlineId;
  const gamesCsv = buildGamesCsv(transactions, data.games);
  // The header line has no CRLF; a CRLF means at least one matched-game row.
  const hasGames = gamesCsv.includes("\r\n");

  const exportTransactions = () => {
    downloadCsv(buildTransactionsCsv(transactions), transactionsFileName(onlineId));
  };

  const exportGames = () => {
    downloadCsv(gamesCsv, gamesFileName(onlineId));
  };

  return (
    <Card className="lg:col-span-3">
      <ExportHeader />
      <CardContent className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={exportTransactions}
          disabled={transactions.length === 0}
        >
          Export transactions (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportGames} disabled={!hasGames}>
          Export games (CSV)
        </Button>
      </CardContent>
    </Card>
  );
}
