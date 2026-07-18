import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowRight, Upload } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { importDashboardFromCsv } from "@/features/dashboard/export/import-dashboard";

// The dashboard store lives on the root router context (the same per-request
// registry the dashboard reads). Reading it via `from: "__root__"` resolves from
// anywhere in the tree, so the restore writes go through the service rather than
// the raw registry — mirroring the sign-in card.

/** The two CSVs a restore needs: the full game library and the account profile. */
interface Selection {
  games: File;
  account: File;
}

/**
 * Rebuild a dashboard from the picked games + account CSVs, then cache it and
 * make it active — the same landing the sign-in flow reaches, but from files
 * instead of a live PSN pull. The parse/decode/reconstruct is a `useMutation`
 * `mutationFn` so the async file reads stay off an effect and errors surface as a
 * toast.
 */
function useRestore() {
  const navigate = useNavigate();
  const { dashboardStore, transactionStore } = useRouteContext({ from: "__root__" });
  return useMutation({
    mutationFn: async ({ games, account }: Selection) => {
      const [gamesCsv, accountCsv] = await Promise.all([games.text(), account.text()]);
      return importDashboardFromCsv(gamesCsv, accountCsv);
    },
    onSuccess: (data) => {
      dashboardStore.save(data);
      transactionStore.migrateLegacy();
      dashboardStore.setActive(data.profile.accountId);
      void navigate({ to: "/dashboard" });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Could not restore a dashboard from those CSVs."
      );
    },
  });
}

/** The first selected file for an input, or `null` when the picker was cleared. */
function firstFile(event: React.ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}

/** A labelled `.csv` file picker that reports its first selected file. */
function CsvFileField({
  label,
  disabled,
  onSelect,
}: {
  label: string;
  disabled: boolean;
  onSelect: (file: File | null) => void;
}) {
  const id = useId();
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => onSelect(firstFile(event))}
        disabled={disabled}
      />
    </Field>
  );
}

function RestoreButton({ pending, disabled }: { pending: boolean; disabled: boolean }) {
  if (pending) {
    return (
      <Button type="submit" disabled>
        <Spinner className="size-4" /> Restoring…
      </Button>
    );
  }
  return (
    <Button type="submit" disabled={disabled}>
      Restore dashboard <ArrowRight className="size-4" />
    </Button>
  );
}

/**
 * Restore a cached dashboard from a previously exported games + account CSV pair.
 * A self-contained onboarding affordance for the reconstruction importer, so the
 * exported files are a real backup rather than a dead end.
 */
export function RestoreDashboardCard() {
  const [games, setGames] = useState<File | null>(null);
  const [account, setAccount] = useState<File | null>(null);
  const restore = useRestore();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (games === null || account === null) {
      toast.error("Pick both the games and account CSV files first.");
      return;
    }
    restore.mutate({ games, account });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-4" /> Restore from CSV
        </CardTitle>
        <CardDescription>
          Already exported your data? Pick your games and account CSV files to rebuild the
          dashboard, no token needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <CsvFileField label="Games CSV" disabled={restore.isPending} onSelect={setGames} />
          <CsvFileField label="Account CSV" disabled={restore.isPending} onSelect={setAccount} />
          <RestoreButton
            pending={restore.isPending}
            disabled={games === null || account === null}
          />
        </form>
      </CardContent>
    </Card>
  );
}
