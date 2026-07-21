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
  if (mutation) return "Refresh failed. Try again.";
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
      state.setNpsso("");
      state.setValidationError(undefined);
      state.setDemoError(undefined);
      state.setOpenState(false);
      onComplete?.();
      toast.success("PlayStation data refreshed.");
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

function submitRefresh(event: React.FormEvent, options: SubmitRefreshOptions) {
  event.preventDefault();
  if (options.safeDemo) {
    options.setDemoError(undefined);
    options.mutate("playloom-demo-credential");
    return;
  }
  const token = normalizeNpsso(options.npsso);
  if (!token) {
    options.setValidationError("Paste your npsso token first.");
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
    submit: (event: React.FormEvent) =>
      submitRefresh(event, {
        safeDemo,
        npsso: state.npsso,
        setValidationError: state.setValidationError,
        setDemoError: state.setDemoError,
        mutate: refresh.mutate,
      }),
    previewFailure: () =>
      state.setDemoError(
        "That demo credential was rejected. It remains visible so the attempt can be checked."
      ),
  };
}

function TokenHelp() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Your npsso token is password-equivalent. It is sent once through the server to PlayStation,
        never stored, and your refreshed dashboard remains in this browser.
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
  const describedBy = refresh.error ? "refresh-error" : "refresh-guidance";
  return (
    <Field data-invalid={refresh.error ? "true" : undefined}>
      <FieldLabel>npsso token</FieldLabel>
      <FieldControl
        render={
          <Input
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
        The token is sent once for this refresh, then discarded. It is never stored.
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
            aria-describedby={refresh.error ? "refresh-error" : "refresh-guidance"}
          />
        }
      />
      <FieldDescription id="refresh-guidance">
        A fixed, non-secret fixture. This sheet never accepts or transmits a real token.
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
        ref={(element) => {
          element?.focus();
        }}
        tabIndex={-1}
        className="grid gap-2 border-l-[3px] border-primary bg-primary/7 p-3 text-[0.6875rem] text-muted-foreground outline-none"
      >
        <Progress value={68} aria-label="Refresh in progress" className="h-1.25 gap-0" />
        <span>Refreshing playtime and trophies…</span>
      </output>
    );
  }
  if (!refresh.error) return null;
  return (
    <p
      id="refresh-error"
      className="border-l-[3px] border-destructive bg-destructive/8 px-3 py-2.5 text-[0.6875rem] leading-[1.45] text-destructive-foreground"
      role="alert"
    >
      {refresh.error}
    </p>
  );
}

function RefreshForm({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  return (
    <form id="refresh-dashboard" className="space-y-4" onSubmit={refresh.submit}>
      {refresh.safeDemo ? (
        <div className="border-l-[3px] border-primary bg-primary/7 p-4 text-sm leading-[1.6]">
          No token or network request is used. The fixed credential below exists only to make
          validation, failure retention, progress and success states evaluable.
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
        Refresh PlayStation data
      </SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  );
}

function RefreshSheet({ refresh }: { refresh: ReturnType<typeof useRefresh> }) {
  const isMobile = useMediaQuery("max-md");
  const description = refresh.safeDemo
    ? "Safe signed-in prototype workflow using local demo data only."
    : "Load your latest playtime and trophies without storing your token.";
  return (
    <SheetPopup
      side={isMobile ? "bottom" : "right"}
      className="border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] text-foreground shadow-[-12px_0_30px_var(--playloom-shadow)] sm:max-w-md max-sm:max-h-[calc(100dvh-3rem)]"
      closeProps={{ className: "min-h-11 min-w-11 rounded-none" }}
    >
      <RefreshHeader description={description} />
      <SheetPanel>
        <RefreshForm refresh={refresh} />
      </SheetPanel>
      <SheetFooter className="border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-recessed)] px-6 py-4 max-sm:flex-col sm:justify-between">
        <SheetClose
          render={
            <Button
              variant="ghost"
              className="min-h-11 rounded-none text-foreground hover:bg-accent"
            />
          }
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
          Refresh data
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
            aria-label={props.shell ? "Refresh PlayStation data" : undefined}
          />
        }
      >
        <RefreshCw /> <span className={props.shell ? "max-sm:sr-only" : undefined}>Refresh</span>
      </SheetTrigger>
      <RefreshSheet refresh={refresh} />
    </Sheet>
  );
}
