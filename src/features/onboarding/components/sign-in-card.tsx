import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, ExternalLink, ShieldAlert, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldControl, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { signInWithToken } from "@/server/api/account.effect";
import { type CachedAccount, useCachedAccounts } from "@/stores/dashboard-store";

// The dashboard store lives on the root router context (the per-request registry
// `useCachedAccounts` also reads). Reading it via `from: "__root__"` resolves
// from anywhere in the tree, so writers go through the service rather than the
// raw registry.

/**
 * Reduce a pasted npsso value to the bare token.
 *
 * Tolerates the three real-world paste shapes:
 * - the full JSON the ssocookie page renders: `{"npsso":"<token>"}`
 * - the value with its surrounding quotes: `"<token>"`
 * - the bare token: `<token>`
 */
export function normalizeNpsso(input: string): string {
  const trimmed = input.trim();
  const jsonMatch = trimmed.match(/"?npsso"?\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) {
    return jsonMatch[1].trim();
  }
  return trimmed.replace(/^[{}"\s]+|[{}"\s]+$/g, "").trim();
}

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
      <div className="space-y-1 rounded-md border bg-muted/50 p-2 font-mono text-xs break-all">
        <p>
          <span className="text-muted-foreground">{'{"npsso":"'}</span>
          <span className="font-semibold text-foreground">abcd…(64 characters)…wxyz</span>
          <span className="text-muted-foreground">{'"}'}</span>
        </p>
        <p className="font-sans text-muted-foreground">
          Copy <span className="font-semibold text-foreground">only</span> the highlighted token,
          not the quotes, braces, or <code className="font-mono">npsso:</code>.
        </p>
      </div>
    ),
  },
];

const PSN_API_URL = "https://github.com/achievements-app/psn-api";
const REPO_URL = "https://github.com/Ernxst/psn-playtime";

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

function RiskWarningPoints() {
  return (
    <>
      <li>
        The token grants{" "}
        <strong className="font-semibold text-foreground">
          full access to your PlayStation account
        </strong>
        . Treat it exactly like a password.
      </li>
      <li>
        <strong className="font-semibold text-foreground">Never share it</strong> with anyone, and
        never post a screenshot of it.
      </li>
    </>
  );
}

function RiskDetailsList() {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pr-1 pl-5 text-muted-foreground">
      <RiskWarningPoints />
      <li>
        It uses your PSN session cookie with Sony's internal endpoints. There is no public PSN API,
        so this is technically a Terms of Service violation.
      </li>
      <li>
        It is read-only. It only reads your own profile and playtime, and never changes anything on
        your account.
      </li>
      <li>
        Your token is sent to the server only to load your data once, then discarded. It is never
        logged or stored. Only the resulting stats are cached in your browser.
      </li>
      <li>
        The token expires after about 2 months, and you can revoke it any time by signing out of
        PSN.
      </li>
      <li>
        This app is <ExternalAnchor href={REPO_URL}>open source</ExternalAnchor>, so you can read
        the code yourself or self-host your own instance if you'd rather not trust this one.
      </li>
      <li>
        Curious how it works? It is built on{" "}
        <ExternalAnchor href={PSN_API_URL}>psn-api</ExternalAnchor>.
      </li>
      <li>
        If you{" "}
        <strong className="font-semibold text-foreground">
          do not trust this app, do not enter your token
        </strong>
        . The demo is always available.
      </li>
    </ul>
  );
}

/**
 * On-demand "learn about the risk" action. Collapsed by default, so the detail
 * only appears when the user opens it, never as an always-on wall of text.
 */
function RiskDetails() {
  return (
    <details className="group rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs">
      <summary className="-m-1 flex cursor-pointer list-none items-center gap-2 rounded-md p-1 font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
        Learn about the risk
        <ChevronDown
          className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <RiskDetailsList />
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
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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
      toast.error(err instanceof Error ? err.message : "Sign in failed. Check your token.");
    },
  });
}

function SubmitButton({ pending, disabled }: { pending: boolean; disabled: boolean }) {
  if (pending) {
    return (
      <Button type="submit" disabled>
        <Spinner className="size-4" /> Signing in…
      </Button>
    );
  }
  return (
    <Button type="submit" disabled={disabled}>
      Sign in <ArrowRight className="size-4" />
    </Button>
  );
}

function ConsentCheckbox({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const consentId = useId();
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={consentId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <Label htmlFor={consentId} className="text-xs font-normal text-muted-foreground">
        I understand this token can sign in to my PlayStation account, like handing over my
        PlayStation password, including whoever runs this app.
      </Label>
    </div>
  );
}

function TokenForm() {
  const [npsso, setNpsso] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const signIn = useSignIn();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acknowledged) {
      return;
    }
    const token = normalizeNpsso(npsso);
    if (token) {
      signIn.mutate(token);
    } else {
      toast.error("Paste your npsso token first.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <Field className="gap-2">
        <FieldLabel>npsso token</FieldLabel>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <FieldControl
            render={
              <Input
                value={npsso}
                onChange={(e) => setNpsso(e.target.value)}
                placeholder="Paste your 64-character npsso value"
                autoComplete="off"
                spellCheck={false}
                disabled={signIn.isPending}
              />
            }
          />
          <SubmitButton pending={signIn.isPending} disabled={!acknowledged} />
        </div>
      </Field>
      <ConsentCheckbox checked={acknowledged} onCheckedChange={setAcknowledged} />
    </form>
  );
}

function AccountButton({ account }: { account: CachedAccount }) {
  const navigate = useNavigate();
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return (
    <Button
      variant="outline"
      className="h-auto sm:h-auto w-full justify-start gap-3 py-3"
      onClick={() => {
        dashboardStore.setActive(account.accountId);
        void navigate({ to: "/dashboard" });
      }}
    >
      <Avatar className="size-8">
        <AvatarImage src={account.avatarUrl} alt={account.onlineId} />
        <AvatarFallback>{account.onlineId.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate">Continue as {account.onlineId}</span>
      <ArrowRight className="ml-auto size-4 shrink-0" />
    </Button>
  );
}

/**
 * Two-step "remove account" control. The first click swaps to an explicit
 * confirm/cancel pair rather than firing immediately, so wiping an account's
 * cached games and transactions from `localStorage` is never a single tap.
 * Confirming goes through the router-context services — `dashboardStore.remove`
 * drops the cached dashboard (and its active pointer), `transactionStore.clear`
 * wipes the imported transactions — never the raw registry.
 */
function RemoveAccountButton({ account }: { account: CachedAccount }) {
  const [confirming, setConfirming] = useState(false);
  const { dashboardStore, transactionStore } = useRouteContext({ from: "__root__" });

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${account.onlineId}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          dashboardStore.remove(account.accountId);
          transactionStore.clear();
          setConfirming(false);
        }}
      >
        Remove
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}

/** Lists accounts already cached in localStorage so a revisit needs no token. */
function AccountSelector() {
  const accounts = useCachedAccounts();
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Pick up where you left off:</p>
      <div className="space-y-2">
        {accounts.map((account) => (
          <div key={account.accountId} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <AccountButton account={account} />
            </div>
            <RemoveAccountButton account={account} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignInCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your account</CardTitle>
        <CardDescription>
          We use a one-time PSN token (npsso) to read your library. It never leaves this session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <AccountSelector />
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">How to get your token:</p>
          <ol className="space-y-3 text-sm">
            {STEPS.map((step, i) => (
              <Step key={step.text} index={i} {...step} />
            ))}
          </ol>
        </div>
        <RiskDetails />
        <TokenForm />
        <div className="flex items-center justify-center pt-1">
          <Button render={<Link to="/dashboard" />} variant="ghost" size="sm">
            Or explore the demo instead
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
