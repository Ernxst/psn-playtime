import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowRight, Upload } from "lucide-react";
import { useId, useReducer, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { buildGamesCsv } from "@/features/dashboard/export/csv";
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

type RestoreField = keyof Selection;

interface RestoreFailure {
  field: RestoreField | "form";
  fileName?: string;
}

interface RestoreFormState {
  games: File | null;
  account: File | null;
  gamesError: string | null;
  accountError: string | null;
  formError: string | null;
  accountValidated: boolean;
}

const EMPTY_GAMES_CSV = buildGamesCsv([], []);
const INITIAL_RESTORE_FORM_STATE: RestoreFormState = {
  games: null,
  account: null,
  gamesError: null,
  accountError: null,
  formError: null,
  accountValidated: false,
};

class RestoreCsvError extends Error {
  readonly field: RestoreField;
  readonly fileName: string;

  constructor(field: RestoreField, fileName: string) {
    super(`Invalid ${field} CSV`);
    this.field = field;
    this.fileName = fileName;
  }
}

async function readCsv(field: RestoreField, file: File): Promise<string> {
  try {
    return await file.text();
  } catch {
    throw new RestoreCsvError(field, file.name);
  }
}

/**
 * Rebuild a dashboard from the picked games + account CSVs, then cache it and
 * make it active — the same landing the sign-in flow reaches, but from files
 * instead of a live PSN pull. The parse/decode/reconstruct is a `useMutation`
 * `mutationFn` so the async file reads stay off an effect and errors return to
 * the picker that needs correction.
 */
function useRestore(onFailure: (failure: RestoreFailure) => void) {
  const navigate = useNavigate();
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return useMutation({
    mutationFn: async ({ games, account }: Selection) => {
      const [gamesCsv, accountCsv] = await Promise.all([
        readCsv("games", games),
        readCsv("account", account),
      ]);
      try {
        importDashboardFromCsv(EMPTY_GAMES_CSV, accountCsv);
      } catch {
        throw new RestoreCsvError("account", account.name);
      }
      try {
        return importDashboardFromCsv(gamesCsv, accountCsv);
      } catch {
        throw new RestoreCsvError("games", games.name);
      }
    },
    onSuccess: (data) => {
      dashboardStore.save(data);
      dashboardStore.setActive(data.profile.accountId);
      void navigate({ to: "/dashboard" });
    },
    onError: (error) => {
      onFailure(
        error instanceof RestoreCsvError
          ? { field: error.field, fileName: error.fileName }
          : { field: "form" }
      );
    },
  });
}

/** The first selected file for an input, or `null` when the picker was cleared. */
function firstFile(event: React.ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}

interface CsvFileFieldProps {
  label: string;
  file: File | null;
  validated: boolean;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onSelect: (file: File | null) => void;
}

function csvDescriptionIds(
  file: File | null,
  error: string | null,
  statusId: string,
  errorId: string
): string | undefined {
  const ids: string[] = [];
  if (file) ids.push(statusId);
  if (error) ids.push(errorId);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function CsvSelectionStatus({
  label,
  file,
  validated,
  id,
}: Pick<CsvFileFieldProps, "label" | "file" | "validated"> & { id: string }) {
  if (!file) return null;
  const message = validated ? `${file.name} is a valid ${label}.` : `${file.name} selected.`;
  return <FieldDescription id={id}>{message}</FieldDescription>;
}

function CsvFieldError({ error, id }: { error: string | null; id: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-xs text-destructive-foreground">
      {error}
    </p>
  );
}

/** A labelled `.csv` file picker that reports its first selected file. */
function CsvFileField(props: CsvFileFieldProps) {
  const { label, file, validated, error, inputRef, disabled, onSelect } = props;
  const id = useId();
  const statusId = useId();
  const errorId = useId();
  const describedBy = csvDescriptionIds(file, error, statusId, errorId);
  return (
    <Field
      className="min-w-0 gap-2 border-t border-[var(--playloom-rule)] pt-4"
      data-invalid={error ? "true" : undefined}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => onSelect(firstFile(event))}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        size="lg"
        className="rounded-sm border-[var(--playloom-rule-strong)] bg-transparent shadow-none has-focus-visible:border-[var(--playloom-cobalt)]"
      />
      <CsvSelectionStatus label={label} file={file} validated={validated} id={statusId} />
      <CsvFieldError error={error} id={errorId} />
    </Field>
  );
}

function RestoreButton({ pending }: { pending: boolean }) {
  const className =
    "self-start rounded-sm border-[var(--playloom-ink)] bg-transparent px-5 text-[var(--playloom-ink)] shadow-none hover:bg-[var(--playloom-ink)] hover:text-[var(--playloom-paper)]";
  if (pending) {
    return (
      <Button type="submit" variant="outline" className={className} disabled>
        <Spinner className="size-4" /> Restore archive
      </Button>
    );
  }
  return (
    <Button type="submit" variant="outline" className={className}>
      Restore archive <ArrowRight className="size-4" aria-hidden="true" />
    </Button>
  );
}

function mergeRestoreFormState(
  state: RestoreFormState,
  change: Partial<RestoreFormState>
): RestoreFormState {
  return { ...state, ...change };
}

function restoreFailureChange(failure: RestoreFailure): Partial<RestoreFormState> {
  const name = failure.fileName ?? "That file";
  if (failure.field === "account") {
    return {
      accountValidated: false,
      accountError: `${name} is not a valid Account CSV. Choose the Account CSV from a Playloom export.`,
    };
  }
  if (failure.field === "games") {
    return {
      accountValidated: true,
      gamesError: `${name} is not a valid Games CSV. Choose the Games CSV from the same Playloom export.`,
    };
  }
  return {
    formError:
      "Unable to restore this archive. Choose both files from the same Playloom export and try again.",
  };
}

function completeSelection(state: RestoreFormState): Selection | null {
  if (!state.games || !state.account) return null;
  return { games: state.games, account: state.account };
}

function useRestoreFormModel() {
  const [state, update] = useReducer(mergeRestoreFormState, INITIAL_RESTORE_FORM_STATE);
  const gamesRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLInputElement>(null);
  const restore = useRestore((failure) => {
    update(restoreFailureChange(failure));
    const ref = failure.field === "account" ? accountRef : gamesRef;
    window.requestAnimationFrame(() => ref.current?.focus());
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    update({
      gamesError: state.games ? null : "Choose the Games CSV from your Playloom export.",
      accountError: state.account ? null : "Choose the Account CSV from your Playloom export.",
      formError: null,
    });
    const selection = completeSelection(state);
    if (!selection) {
      const ref = state.games ? accountRef : gamesRef;
      window.requestAnimationFrame(() => ref.current?.focus());
      return;
    }
    update({ accountValidated: false });
    restore.mutate(selection);
  }

  function selectGames(games: File | null) {
    update({ games, gamesError: null, formError: null });
  }

  function selectAccount(account: File | null) {
    update({ account, accountValidated: false, accountError: null, formError: null });
  }

  return { state, gamesRef, accountRef, restore, submit, selectGames, selectAccount };
}

type RestoreFormModel = ReturnType<typeof useRestoreFormModel>;

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-xs text-destructive-foreground">{error}</p>;
}

function RestoreForm({ model }: { model: RestoreFormModel }) {
  const { state, restore } = model;
  return (
    <form onSubmit={model.submit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <CsvFileField
          label="Games CSV"
          file={state.games}
          validated={false}
          error={state.gamesError}
          inputRef={model.gamesRef}
          disabled={restore.isPending}
          onSelect={model.selectGames}
        />
        <CsvFileField
          label="Account CSV"
          file={state.account}
          validated={state.accountValidated}
          error={state.accountError}
          inputRef={model.accountRef}
          disabled={restore.isPending}
          onSelect={model.selectAccount}
        />
      </div>
      <FormError error={state.formError} />
      <RestoreButton pending={restore.isPending} />
    </form>
  );
}

/** Restore a cached dashboard from a previously exported games + account CSV pair. */
export function RestoreDashboardCard() {
  const model = useRestoreFormModel();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="border-y border-[var(--playloom-rule-strong)] py-7"
    >
      <div className="mb-6 flex items-start gap-3">
        <Upload className="mt-1 size-4 shrink-0 text-[var(--playloom-cobalt)]" aria-hidden="true" />
        <div>
          <h3 id={titleId} className="text-lg font-semibold tracking-tight">
            Choose your export files
          </h3>
          <p className="mt-1 max-w-[55ch] text-sm leading-6 text-[#5e6268]">
            Choose the Games CSV and Account CSV from the same Playloom export. No PlayStation token
            is needed.
          </p>
        </div>
      </div>
      <RestoreForm model={model} />
    </section>
  );
}
