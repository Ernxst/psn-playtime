import { useMutation } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldControl, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { normalizeNpsso } from "@/domain/npsso";
import { useMediaQuery } from "@/hooks/use-media-query";

interface Props {
  onRefresh: (npsso: string) => Promise<void>;
  onComplete?: () => void;
  safeDemo?: boolean;
  shell?: boolean;
}

function refreshError(
  validation: string | undefined,
  demo: string | undefined,
  mutation: unknown
): string | undefined {
  if (validation) return validation;
  if (demo) return demo;
  if (mutation instanceof Error) return mutation.message;
  if (mutation) return "Unable to refresh the PlayStation archive. Try again.";
  return undefined;
}

function useRefreshState() {
  const [open, setOpenState] = useState(false);
  const [npsso, setNpsso] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const [demoError, setDemoError] = useState<string>();
  return {
    open,
    setOpenState,
    npsso,
    setNpsso,
    validationError,
    setValidationError,
    demoError,
    setDemoError,
  };
}

type RefreshState = ReturnType<typeof useRefreshState>;

function useRefreshMutation(
  onRefresh: Props["onRefresh"],
  onComplete: Props["onComplete"],
  state: RefreshState
) {
  return useMutation({
    mutationFn: (token: string) => onRefresh(token),
    onSuccess: () => {
      toast.success(
        "PlayStation archive refreshed. Your updated archive is saved in this browser and ready to browse."
      );
      state.setNpsso("");
      state.setValidationError(undefined);
      state.setDemoError(undefined);
      state.setOpenState(false);
      onComplete?.();
    },
  });
}

interface SubmitRefreshOptions {
  safeDemo: boolean;
  npsso: string;
  setValidationError: RefreshState["setValidationError"];
  setDemoError: RefreshState["setDemoError"];
  mutate: (token: string) => void;
}

function submitRefresh(event: React.FormEvent<HTMLFormElement>, options: SubmitRefreshOptions) {
  event.preventDefault();
  if (options.safeDemo) {
    options.setDemoError(undefined);
    options.mutate("playloom-demo-credential");
    return;
  }
  const token = normalizeNpsso(options.npsso);
  if (!token) {
    options.setValidationError("Paste your npsso token to refresh this archive.");
    const input = event.currentTarget.elements.namedItem("npsso");
    if (input instanceof HTMLInputElement) input.focus();
    return;
  }
  options.setValidationError(undefined);
  options.mutate(token);
}

function useRefresh({ onRefresh, onComplete, safeDemo = false }: Props) {
  const state = useRefreshState();
  const refresh = useRefreshMutation(onRefresh, onComplete, state);

  function setOpen(next: boolean) {
    if (refresh.isPending && !next) return;
    state.setOpenState(next);
  }
  function changeToken(value: string) {
    state.setNpsso(value);
    state.setValidationError(undefined);
    refresh.reset();
  }
  return {
    open: state.open,
    setOpen,
    npsso: state.npsso,
    changeToken,
    pending: refresh.isPending,
    error: refreshError(state.validationError, state.demoError, refresh.error),
    safeDemo,
    submit: (event: React.FormEvent<HTMLFormElement>) =>
      submitRefresh(event, {
        safeDemo,
        npsso: state.npsso,
        setValidationError: state.setValidationError,
        setDemoError: state.setDemoError,
        mutate: refresh.mutate,
      }),
    previewFailure: () => state.setDemoError("That demo credential was rejected."),
  };
}

function TokenHelp() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Use a fresh npsso token for this PlayStation account. The token can sign in to your account,
        so treat it like your password. It is sent once through the server to PlayStation to update
        playtime and trophies, then discarded. The archive already saved in this browser remains
        available if the refresh fails.
      </p>
      <p>
        <a
          href="https://www.playstation.com/"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
        >
          Sign in to PlayStation
        </a>{" "}
        in this browser, then copy the npsso value from the{" "}
        <a
          href="https://ca.account.sony.com/api/v1/ssocookie"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
        >
          SSO cookie page <ExternalLink className="size-3" />
        </a>
        .
      </p>
    </div>
  );
}

function LiveTokenField({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  const describedBy = refresh.error ? "refresh-guidance refresh-error" : "refresh-guidance";
  return (
    <Field data-invalid={refresh.error ? "true" : undefined}>
      <FieldLabel>npsso token</FieldLabel>
      <FieldControl
        render={
          <Input
            name="npsso"
            type="password"
            value={refresh.npsso}
            onChange={(event) => refresh.changeToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={refresh.pending}
            aria-invalid={refresh.error ? true : undefined}
            aria-describedby={describedBy}
            placeholder="Paste your fresh npsso value"
          />
        }
      />
      <FieldDescription id="refresh-guidance">
        The refreshed archive is saved in this browser; the token is not.
      </FieldDescription>
    </Field>
  );
}

function DemoTokenField({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  return (
    <Field data-invalid={refresh.error ? "true" : undefined}>
      <FieldLabel>Demo credential</FieldLabel>
      <FieldControl
        render={
          <Input
            value="PLAYLOOM-DEMO"
            readOnly
            disabled={refresh.pending}
            aria-invalid={refresh.error ? true : undefined}
            aria-describedby={refresh.error ? "refresh-guidance refresh-error" : "refresh-guidance"}
          />
        }
      />
      <FieldDescription id="refresh-guidance">
        This non-secret demo credential stays in the browser. No PlayStation request is made.
      </FieldDescription>
    </Field>
  );
}

function TokenField({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  return refresh.safeDemo ? (
    <DemoTokenField refresh={refresh} />
  ) : (
    <LiveTokenField refresh={refresh} />
  );
}

function RefreshStatus({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  if (refresh.pending) {
    return (
      <output
        aria-label="Refresh progress"
        ref={(element) => {
          element?.focus();
        }}
        tabIndex={-1}
        className="grid gap-2 border-l-[3px] border-primary bg-primary/7 p-3 text-[0.6875rem] text-muted-foreground outline-none"
      >
        <Progress value={68} aria-label="Refresh in progress" className="h-1.25 gap-0" />
        <span className="font-medium text-foreground">Refreshing PlayStation archive…</span>
        <span>Your saved archive stays available until the update completes.</span>
      </output>
    );
  }
  if (!refresh.error) return null;
  return (
    <div
      id="refresh-error"
      className="space-y-1 border-l-[3px] border-destructive bg-destructive/8 px-3 py-2.5 text-[0.6875rem] leading-[1.45] text-destructive-foreground"
      role="alert"
    >
      <p className="font-medium">{refresh.error}</p>
      <p>Your saved archive is unchanged. Try again when ready, or cancel to keep browsing.</p>
    </div>
  );
}

function RefreshForm({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  return (
    <form id="refresh-dashboard" className="space-y-4" onSubmit={refresh.submit}>
      {refresh.safeDemo ? (
        <div className="border-l-[3px] border-primary bg-primary/7 p-4 text-sm leading-[1.6]">
          This demo refresh uses saved local data only. It cannot accept or send a real PlayStation
          token.
        </div>
      ) : (
        <TokenHelp />
      )}
      <TokenField refresh={refresh} />
      {refresh.safeDemo && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={refresh.previewFailure}
          disabled={refresh.pending}
        >
          Preview rejected credential
        </Button>
      )}
      <RefreshStatus refresh={refresh} />
    </form>
  );
}

function RefreshHeader({ description }: { description: string }) {
  return (
    <SheetHeader className="border-b border-[var(--playloom-rule-strong)] px-6 py-5">
      <p className="text-[0.625rem] font-bold tracking-[0.14em] text-primary uppercase">
        Archive status
      </p>
      <SheetTitle className="font-[Fraunces_Variable] text-2xl font-semibold">
        Refresh PlayStation archive
      </SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  );
}

function RefreshSheet({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  const isMobile = useMediaQuery("max-md");
  const description = refresh.safeDemo
    ? "Update the saved demo archive from local data without contacting PlayStation."
    : "Update the saved archive with the latest playtime and trophies from this PlayStation account.";
  return (
    <SheetPopup
      side={isMobile ? "bottom" : "right"}
      className="border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] text-foreground shadow-[-12px_0_30px_var(--playloom-shadow)] sm:max-w-md max-sm:max-h-[calc(100dvh-3rem)]"
      closeProps={{
        className: "min-h-11 min-w-11 rounded-none",
        disabled: refresh.pending,
      }}
    >
      <RefreshHeader description={description} />
      <SheetPanel>
        <RefreshForm refresh={refresh} />
      </SheetPanel>
      <SheetFooter className="border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-recessed)] px-6 py-4 max-sm:flex-col sm:justify-between">
        <SheetClose
          render={<Button variant="ghost" className="min-h-11 rounded-none" />}
          disabled={refresh.pending}
        >
          Cancel
        </SheetClose>
        <Button
          type="submit"
          form="refresh-dashboard"
          loading={refresh.pending}
          className="min-h-11 rounded-none border-primary bg-primary text-primary-foreground hover:bg-accent-foreground"
        >
          Refresh PlayStation archive
        </Button>
      </SheetFooter>
    </SheetPopup>
  );
}

export function RefreshDashboard(props: Props) {
  const refresh = useRefresh(props);
  return (
    <Sheet open={refresh.open} onOpenChange={refresh.setOpen}>
      <SheetTrigger
        render={
          <Button
            variant={props.shell ? "ghost" : "outline"}
            size="sm"
            className={
              props.shell ? "h-10 rounded-none px-2 active:scale-[0.96] sm:h-10" : undefined
            }
            aria-label={props.shell ? "Refresh PlayStation data for this archive" : undefined}
          />
        }
      >
        <RefreshCw />
        <span className={props.shell ? "max-sm:sr-only" : undefined}>Refresh archive</span>
      </SheetTrigger>
      <RefreshSheet refresh={refresh} />
    </Sheet>
  );
}
