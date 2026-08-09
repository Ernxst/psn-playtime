import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { ArrowRight, ChevronDown, ExternalLink, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { useId, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldControl, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { normalizeNpsso } from "@/domain/npsso";
import { importTransactionsCsv } from "@/features/dashboard/export/import-transactions";
import { signInWithToken } from "@/server/api/account.effect";
import { type CachedAccount, useCachedAccounts } from "@/stores/dashboard-store";

// The dashboard store lives on the root router context (the per-request registry
// `useCachedAccounts` also reads). Reading it via `from: "__root__"` resolves
// from anywhere in the tree, so writers go through the service rather than the
// raw registry.

const STEPS: Array<{
  text: string;
  href?: string;
  linkText?: string;
  example?: React.ReactNode;
}> = [
  {
    text: "Log in to your account at playstation.com (in the browser you're using now).",
    href: "https://www.playstation.com",
    linkText: "Open playstation.com",
  },
  {
    text: "In the same browser, open the SSO cookie page below.",
    href: "https://ca.account.sony.com/api/v1/ssocookie",
    linkText: "Open the ssocookie page",
  },
  {
    text: "Copy the 64-character npsso token from that page and paste it below.",
    example: (
      <div className="space-y-1 rounded-sm border border-white/15 bg-white/5 p-3 font-mono text-xs break-all">
        <p>
          <span className="text-[#aaa69d]">{'{"npsso":"'}</span>
          <span className="font-semibold text-[#f3efe5]">abcd…(64 characters)…wxyz</span>
          <span className="text-[#aaa69d]">{'"}'}</span>
        </p>
        <p className="font-sans text-[#c9c4b9]">
          Copy <span className="font-semibold text-[#f3efe5]">only</span> the highlighted token, not
          the quotes, braces, or <code className="font-mono">npsso:</code>.
        </p>
      </div>
    ),
  },
];

const PSN_API_URL = "https://github.com/achievements-app/psn-api";
const REPO_URL = "https://github.com/Ernxst/psn-playtime";
const TRANSACTION_RESTORE_ERROR =
  "We couldn't read that file as a transactions CSV. Export it again and try again.";

function subscribeToHydration() {
  return () => undefined;
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

/** Keep the server and first client render identical before browser-backed accounts are shown. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
}

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-[#d7e1ff] underline decoration-[#d7e1ff]/50 underline-offset-4 hover:text-white hover:decoration-white"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

function ConnectionDetails() {
  return (
    <details className="group border-t border-white/15 px-5 text-xs">
      <summary className="-mx-1 flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-sm px-1 font-medium text-[#d7e1ff] focus-visible:ring-2 focus-visible:ring-[#9eb7ff] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        Connection details
        <ChevronDown
          className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="mb-4 list-disc space-y-2 pr-1 pl-5 leading-5 text-[#cbc7bd]">
        <li>It reads your profile and playtime; it does not change your PlayStation account.</li>
        <li>Only the resulting archive is cached in this browser.</li>
        <li>
          This app is <ExternalAnchor href={REPO_URL}>open source</ExternalAnchor>, and can be
          self-hosted.
        </li>
        <li>
          It is built on <ExternalAnchor href={PSN_API_URL}>psn-api</ExternalAnchor>.
        </li>
      </ul>
    </details>
  );
}

function Step({
  index,
  text,
  href,
  linkText,
  example,
}: (typeof STEPS)[number] & { index: number }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center border border-white/20 font-mono text-[11px] font-semibold text-[#d7e1ff]">
        {index + 1}
      </span>
      <div className="space-y-1">
        <p>{text}</p>
        {href ? <ExternalAnchor href={href}>{linkText}</ExternalAnchor> : null}
        {example}
      </div>
    </li>
  );
}

function TokenInstructions() {
  return (
    <details className="group border-t border-white/15">
      <summary className="flex min-h-18 cursor-pointer list-none items-center gap-3 px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-[#9eb7ff] focus-visible:ring-inset focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span>
          <strong className="block text-sm font-semibold text-[#f3efe5]">Get an NPSSO token</strong>
          <span className="mt-1 block text-xs leading-5 text-[#bdb8ad]">
            Follow the three steps when you are ready to connect.
          </span>
        </span>
        <ChevronDown
          className="ml-auto size-4 shrink-0 text-[#d7e1ff] transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ol className="space-y-4 border-t border-white/15 p-5 text-sm leading-6 text-[#ddd8cc]">
        {STEPS.map((step, index) => (
          <Step key={step.text} index={index} {...step} />
        ))}
      </ol>
    </details>
  );
}

function useSignIn() {
  const navigate = useNavigate();
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return useMutation({
    mutationFn: (token: string) => signInWithToken({ data: { npsso: token } }),
    onSuccess: (data) => {
      // Cache the fetched data client-side and make it the active account; the
      // token is discarded here — revisits render from the cache without it.
      dashboardStore.save(data);
      dashboardStore.setActive(data.profile.accountId);
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : "Unable to connect PlayStation. Check your token and try again."
      );
    },
  });
}

function SubmitButton({ pending }: { pending: boolean }) {
  const className =
    "self-start rounded-sm border-[var(--playloom-cobalt)] bg-[var(--playloom-cobalt)] px-5 text-white shadow-none hover:bg-[#2c5bc7] focus-visible:ring-[#9eb7ff] focus-visible:ring-offset-[var(--playloom-ink)]";
  if (pending) {
    return (
      <Button type="submit" className={className} disabled>
        <Spinner className="size-4" /> Connect PlayStation
      </Button>
    );
  }
  return (
    <Button type="submit" className={className}>
      Connect PlayStation <ArrowRight className="size-4" aria-hidden="true" />
    </Button>
  );
}

interface TokenFormState {
  npsso: string;
  showToken: boolean;
  tokenError: string | null;
}

const INITIAL_TOKEN_FORM_STATE: TokenFormState = {
  npsso: "",
  showToken: false,
  tokenError: null,
};

function mergeTokenFormState(
  state: TokenFormState,
  change: Partial<TokenFormState>
): TokenFormState {
  return { ...state, ...change };
}

function tokenValidation(token: string) {
  return {
    tokenError:
      token.length === 0
        ? "Paste your NPSSO token."
        : token.length === 64
          ? null
          : "Paste the 64-character NPSSO token from PlayStation.",
  };
}

function focusAfterRender(ref: React.RefObject<HTMLInputElement | null>) {
  window.requestAnimationFrame(() => ref.current?.focus());
}

function useTokenFormModel(tokenRef: React.RefObject<HTMLInputElement | null>) {
  const [state, update] = useReducer(mergeTokenFormState, INITIAL_TOKEN_FORM_STATE);
  const tokenId = useId();
  const tokenGuidanceId = useId();
  const tokenErrorId = useId();
  const signIn = useSignIn();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = normalizeNpsso(state.npsso);
    const validation = tokenValidation(token);
    update(validation);
    if (validation.tokenError) return focusAfterRender(tokenRef);
    signIn.mutate(token);
  }

  return {
    state,
    update,
    submit,
    pending: signIn.isPending,
    ids: { tokenId, tokenGuidanceId, tokenErrorId },
  };
}

type TokenFormModel = ReturnType<typeof useTokenFormModel>;

function TokenErrorMessage({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <p id={id} className="text-xs text-[#ffb8b1]">
      {error}
    </p>
  );
}

function TokenVisibilityButton({ model }: { model: TokenFormModel }) {
  const Icon = model.state.showToken ? EyeOff : Eye;
  const label = model.state.showToken ? "Hide token" : "Show token";
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => model.update({ showToken: !model.state.showToken })}
      aria-controls={model.ids.tokenId}
      aria-pressed={model.state.showToken}
      disabled={model.pending}
      className="rounded-sm border-white/20 bg-white/5 text-[#f3efe5] shadow-none hover:bg-white/10 hover:text-white focus-visible:ring-[#9eb7ff] focus-visible:ring-offset-[var(--playloom-ink)]"
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

function TokenGuidance({ id }: { id: string }) {
  return (
    <FieldDescription id={id} className="leading-5 text-[#bdb8ad]">
      This token can access your PlayStation account like your password. It is sent once, then
      discarded and never stored.
    </FieldDescription>
  );
}

function TokenInput({
  model,
  inputRef,
  describedBy,
}: {
  model: TokenFormModel;
  inputRef: React.RefObject<HTMLInputElement | null>;
  describedBy: string;
}) {
  const { state, ids } = model;
  return (
    <Input
      id={ids.tokenId}
      ref={inputRef}
      type={state.showToken ? "text" : "password"}
      value={state.npsso}
      onChange={(event) => model.update({ npsso: event.target.value, tokenError: null })}
      placeholder="Paste your 64-character npsso value"
      autoComplete="off"
      spellCheck={false}
      disabled={model.pending}
      aria-invalid={state.tokenError ? true : undefined}
      aria-describedby={describedBy}
      size="lg"
      className="rounded-sm border-white/25 bg-[var(--playloom-paper-raised)] text-[var(--playloom-ink)] shadow-none has-focus-visible:border-[#9eb7ff] has-focus-visible:ring-[#9eb7ff]/30"
    />
  );
}

function TokenCredentialField({
  model,
  inputRef,
}: {
  model: TokenFormModel;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { state, ids } = model;
  const describedBy = state.tokenError
    ? `${ids.tokenGuidanceId} ${ids.tokenErrorId}`
    : ids.tokenGuidanceId;
  return (
    <Field className="gap-2" data-invalid={state.tokenError ? "true" : undefined}>
      <FieldLabel htmlFor={ids.tokenId} className="text-[#f3efe5]">
        NPSSO token
      </FieldLabel>
      <div className="flex w-full min-w-0 items-stretch gap-2">
        <FieldControl
          render={<TokenInput model={model} inputRef={inputRef} describedBy={describedBy} />}
        />
        <TokenVisibilityButton model={model} />
      </div>
      <TokenGuidance id={ids.tokenGuidanceId} />
      <TokenErrorMessage id={ids.tokenErrorId} error={state.tokenError} />
    </Field>
  );
}

function TokenForm() {
  const tokenRef = useRef<HTMLInputElement>(null);
  const model = useTokenFormModel(tokenRef);

  return (
    <form onSubmit={model.submit} className="flex flex-col gap-5" noValidate>
      <TokenCredentialField model={model} inputRef={tokenRef} />
      <SubmitButton pending={model.pending} />
    </form>
  );
}

function AccountButton({ account }: { account: CachedAccount }) {
  const navigate = useNavigate();
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return (
    <Button
      variant="ghost"
      className="h-auto sm:h-auto w-full justify-start gap-3 rounded-sm border border-white/15 bg-white/5 py-3 text-[#f3efe5] shadow-none hover:bg-white/10 hover:text-white focus-visible:ring-[#9eb7ff] focus-visible:ring-offset-[var(--playloom-ink)]"
      onClick={() => {
        dashboardStore.setActive(account.accountId);
        void navigate({ to: "/dashboard" });
      }}
    >
      <Avatar className="size-8 border border-white/20">
        <AvatarImage src={account.avatarUrl} alt={account.onlineId} />
        <AvatarFallback>{account.onlineId.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate">Continue as {account.onlineId}</span>
      <ArrowRight className="ml-auto size-4 shrink-0" />
    </Button>
  );
}

/**
 * The explicit confirm/cancel pair a destructive control swaps to on its first
 * click, so wiping `localStorage` data is never a single tap. Shared by the
 * per-account and standalone-transaction remove controls.
 */
function ConfirmRemove({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1">
      <Button variant="destructive" size="sm" className="rounded-sm" onClick={onConfirm}>
        Remove
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-sm text-[#f3efe5] hover:bg-white/10 hover:text-white"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

/**
 * Two-step "remove account" control. The first click swaps to {@link ConfirmRemove}
 * rather than firing immediately. Confirming goes through the router-context
 * services — `dashboardStore.remove` drops the cached dashboard (and its active
 * pointer), `transactionStore.clear` wipes that account's imported transactions
 * — never the raw registry.
 */
function RemoveAccountButton({ account }: { account: CachedAccount }) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { dashboardStore, transactionStore } = useRouteContext({ from: "__root__" });

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        ref={triggerRef}
        aria-label={`Remove ${account.onlineId}`}
        className="rounded-sm text-[#bdb8ad] hover:bg-white/10 hover:text-white"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
      </Button>
    );
  }

  return (
    <ConfirmRemove
      onConfirm={() => {
        dashboardStore.remove(account.accountId);
        transactionStore.clear(account.accountId);
        setConfirming(false);
      }}
      onCancel={() => {
        setConfirming(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }}
    />
  );
}

/** Lists accounts already cached in localStorage so a revisit needs no token. */
function AccountSelector({ accounts, hydrated }: { accounts: CachedAccount[]; hydrated: boolean }) {
  const titleId = useId();
  return (
    <section
      className="h-40 overflow-y-auto border-b border-white/15 px-6 py-5 sm:px-8"
      aria-labelledby={titleId}
      aria-busy={hydrated ? undefined : true}
    >
      <p id={titleId} className="text-sm font-semibold text-[#f3efe5]">
        Continue with a saved account
      </p>
      {!hydrated ? (
        <p className="mt-2 text-xs text-[#bdb8ad]">Checking this browser…</p>
      ) : accounts.length === 0 ? (
        <p className="mt-2 text-xs text-[#bdb8ad]">No saved PlayStation account in this browser.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {accounts.map((account) => (
            <div key={account.accountId} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <AccountButton account={account} />
                </div>
                <RemoveAccountButton account={account} />
              </div>
              <RestoreTransactionsButton account={account} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Success toast copy for a completed CSV restore. */
function restoreMessage({ added, total }: { added: number; total: number }): string {
  if (added === 0) return "Those transactions are already imported.";
  const label = added === 1 ? "transaction" : "transactions";
  return `Restored ${added} ${label} (${total} in total).`;
}

/**
 * Restore a previously exported transactions CSV back into the store. The hidden
 * file input's `onChange` reads the chosen file, runs the schema-validated import
 * off the router-context {@link TransactionStore}, and toasts the row count or a
 * clear error — no effect, the whole flow hangs off the change event.
 */
function RestoreTransactionsButton({ account }: { account: CachedAccount }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { transactionStore } = useRouteContext({ from: "__root__" });

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const text = await file.text();
    const exit = await Effect.runPromiseExit(
      importTransactionsCsv(transactionStore, account.accountId, text)
    );
    if (Exit.isSuccess(exit)) {
      toast.success(restoreMessage(exit.value));
    } else {
      toast.error(TRANSACTION_RESTORE_ERROR);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        aria-label={`Restore ${account.onlineId} transactions from CSV`}
        className="sr-only"
        onChange={(event) => void onChange(event)}
      />
      <Button
        variant="ghost"
        size="sm"
        className="rounded-sm px-1 text-xs text-[#bdb8ad] hover:bg-transparent hover:text-white"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" /> Restore transactions
      </Button>
    </div>
  );
}

function ConnectionWorkspace({
  titleId,
  accounts,
  hydrated,
}: {
  titleId: string;
  accounts: CachedAccount[];
  hydrated: boolean;
}) {
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="px-6 py-7 sm:p-8">
        <h3 id={titleId} className="text-xl font-semibold tracking-tight text-[#f3efe5]">
          Use a PlayStation token
        </h3>
        <p className="mt-2 max-w-[52ch] text-sm leading-6 text-[#bdb8ad]">
          Paste the token to load your PlayStation history. PlayStation is the only supported
          connection.
        </p>
        <div className="mt-6">
          <TokenForm />
        </div>
      </div>
      <aside
        className="border-t border-white/15 bg-white/[0.035] md:border-t-0 md:border-l"
        aria-label="Connection help"
      >
        <AccountSelector accounts={accounts} hydrated={hydrated} />
        <div className="p-5">
          <p className="text-sm font-semibold text-[#f3efe5]">Before you connect</p>
          <p className="mt-2 text-xs leading-5 text-[#bdb8ad]">
            Get the token from PlayStation in the same browser you are using now.
          </p>
        </div>
        <ConnectionDetails />
        <TokenInstructions />
      </aside>
    </div>
  );
}

export function SignInCard({ showDemoLink = true }: { showDemoLink?: boolean }) {
  const accounts = useCachedAccounts();
  const hydrated = useHydrated();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden border-y border-white/20 bg-[var(--playloom-ink)] text-[#f3efe5]"
    >
      <ConnectionWorkspace titleId={titleId} accounts={accounts} hydrated={hydrated} />
      {showDemoLink ? (
        <div className="border-t border-white/15 px-6 py-3 sm:px-8">
          <Button
            render={<Link to="/dashboard" />}
            variant="ghost"
            size="sm"
            className="rounded-sm px-0 text-[#d7e1ff] hover:bg-transparent hover:text-white"
          >
            Or explore the demo instead
          </Button>
        </div>
      ) : null}
    </section>
  );
}
