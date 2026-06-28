import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Info, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldControl, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { DashboardData } from "@/lib/psn/types";
import {
  forgetAccount,
  type RememberedAccount,
  rememberAccount,
  useRememberedAccounts,
} from "@/lib/remembered-accounts";
import { signInWithToken } from "@/server/psn";

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

function TosDetails() {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pr-1 pl-9 text-muted-foreground">
      <li>
        It uses your PSN session cookie with Sony's internal endpoints. There is no public PSN API,
        so this is technically a Terms of Service violation.
      </li>
      <li>
        It is read-only. It only reads your own profile and playtime, and never changes anything on
        your account.
      </li>
      <li>
        Your npsso token is like a password, so keep it secret. It stays in your browser session and
        is never shared.
      </li>
      <li>
        The token expires after about 2 months, and you can revoke it any time by signing out of
        PSN.
      </li>
      <li>
        Curious how it works? It is built on{" "}
        <a
          href={PSN_API_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          psn-api
          <ExternalLink className="size-3" />
        </a>
        .
      </li>
    </ul>
  );
}

function TosDisclosure() {
  return (
    <div className="space-y-2 rounded-md border bg-muted/50 p-3 text-xs">
      <p className="flex items-start gap-2 text-foreground">
        <Info
          className="size-3.5 shrink-0 translate-y-px text-muted-foreground"
          aria-hidden="true"
        />
        <span>
          This connects with an <span className="font-semibold">unofficial method</span> that is
          against PlayStation's Terms of Service. The risk for read-only personal use is low, but
          not zero, so you opt in at your own discretion.
        </span>
      </p>
      <details>
        <summary className="ml-[1.375rem] cursor-pointer text-primary underline-offset-4 hover:underline">
          Learn more
        </summary>
        <TosDetails />
      </details>
    </div>
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
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {linkText}
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {example}
      </div>
    </li>
  );
}

/** Variables for a sign-in attempt. `remember` opts the token into local persistence. */
interface SignInVars {
  token: string;
  remember: boolean;
}

type SignIn = UseMutationResult<DashboardData, Error, SignInVars>;

function useSignIn(): SignIn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation<DashboardData, Error, SignInVars>({
    mutationFn: ({ token }) => signInWithToken({ data: { npsso: token } }),
    onSuccess: (data, { token, remember }) => {
      // Only persist the password-grade token when the user opted in.
      if (remember) {
        rememberAccount({
          onlineId: data.profile.onlineId,
          avatarUrl: data.profile.avatarUrl,
          npsso: token,
        });
      }
      queryClient.setQueryData(["dashboard"], data);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Sign in failed. Check your token.");
    },
  });
}

function SubmitButton({ pending }: { pending: boolean }) {
  if (pending) {
    return (
      <Button type="submit" disabled>
        <Spinner className="size-4" /> Signing in…
      </Button>
    );
  }
  return (
    <Button type="submit">
      Sign in <ArrowRight className="size-4" />
    </Button>
  );
}

function RememberToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/50 p-3">
      <Label className="items-start">
        <Checkbox
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="mt-0.5"
        />
        <span>Remember this account on this device</span>
      </Label>
      <p className="pl-[1.625rem] text-xs text-muted-foreground">
        Saves your npsso token in this browser so you can sign back in without pasting it again. The
        token is like a password, so only do this on a device you trust.
      </p>
    </div>
  );
}

function TokenForm({ signIn }: { signIn: SignIn }) {
  const [npsso, setNpsso] = useState("");
  const [remember, setRemember] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = normalizeNpsso(npsso);
    if (token) {
      signIn.mutate({ token, remember });
    } else {
      toast.error("Paste your npsso token first.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field className="gap-2">
        <FieldDescription className="flex items-center gap-2 text-destructive text-xs font-medium">
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          Treat this token like a password. Never share it or post a screenshot of it.
        </FieldDescription>
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
          <SubmitButton pending={signIn.isPending} />
        </div>
      </Field>
      <RememberToggle checked={remember} onChange={setRemember} disabled={signIn.isPending} />
    </form>
  );
}

function ContinueButton({
  account,
  pending,
  onContinue,
}: {
  account: RememberedAccount;
  pending: boolean;
  onContinue: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="h-auto flex-1 justify-start gap-3 py-2"
      onClick={onContinue}
      disabled={pending}
      aria-label={`Continue as ${account.onlineId}`}
    >
      <Avatar className="size-9">
        <AvatarImage src={account.avatarUrl} alt={account.onlineId} />
        <AvatarFallback>{account.onlineId.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="flex flex-col items-start text-left">
        <span className="text-xs font-normal text-muted-foreground">Continue as</span>
        <span className="font-semibold">{account.onlineId}</span>
      </span>
      {pending ? <Spinner className="ml-auto size-4" /> : <ArrowRight className="ml-auto size-4" />}
    </Button>
  );
}

function RememberedAccountRow({
  account,
  signIn,
}: {
  account: RememberedAccount;
  signIn: SignIn;
}) {
  const [stale, setStale] = useState(false);
  const pending = signIn.isPending;

  function onContinue() {
    setStale(false);
    // Reuse the stored token through the same sign-in path as a manual paste.
    signIn.mutate({ token: account.npsso, remember: true }, { onError: () => setStale(true) });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ContinueButton account={account} pending={pending} onContinue={onContinue} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => forgetAccount(account.onlineId)}
          disabled={pending}
          aria-label={`Forget ${account.onlineId}`}
        >
          <X className="size-4" />
        </Button>
      </div>
      {stale ? (
        <p className="text-xs text-destructive">
          That saved sign-in didn't work. The token may have expired, so forget it and paste a fresh
          one below.
        </p>
      ) : null}
    </div>
  );
}

function RememberedAccounts({
  accounts,
  signIn,
}: {
  accounts: readonly RememberedAccount[];
  signIn: SignIn;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Pick up where you left off:</p>
      <div className="space-y-2">
        {accounts.map((account) => (
          <RememberedAccountRow key={account.onlineId} account={account} signIn={signIn} />
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or use a new token</span>
        <Separator className="flex-1" />
      </div>
    </div>
  );
}

export function SignInCard() {
  const accounts = useRememberedAccounts();
  const signIn = useSignIn();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your account</CardTitle>
        <CardDescription>
          We use a one-time PSN token (npsso) to read your library. It never leaves this session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {accounts.length > 0 ? <RememberedAccounts accounts={accounts} signIn={signIn} /> : null}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">How to get your token:</p>
          <ol className="space-y-3 text-sm">
            {STEPS.map((step, i) => (
              <Step key={step.text} index={i} {...step} />
            ))}
          </ol>
        </div>
        <TosDisclosure />
        <TokenForm signIn={signIn} />
        <div className="flex items-center justify-center pt-1">
          <Button render={<Link to="/dashboard" />} variant="ghost" size="sm">
            Or explore the demo instead
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
