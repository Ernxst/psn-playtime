import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldControl, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
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
const REPO_URL = "https://github.com/Ernxst/psn-playtime";

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

function RiskDetailsList() {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pr-1 pl-5 text-muted-foreground">
      <li>
        It uses your PSN session cookie with Sony's internal endpoints. There is no public PSN API,
        so this is technically a Terms of Service violation.
      </li>
      <li>
        It is read-only. It only reads your own profile and playtime, and never changes anything on
        your account.
      </li>
      <li>
        Your token is never logged or stored on the server. It lives only in your browser's httpOnly
        session cookie.
      </li>
      <li>
        The token expires after about 2 months, and you can revoke it any time by signing out of PSN.
      </li>
      <li>
        This app is <ExternalAnchor href={REPO_URL}>open source</ExternalAnchor>, so you can read the
        code yourself or self-host your own instance if you'd rather not trust this one.
      </li>
      <li>
        Curious how it works? It is built on{" "}
        <ExternalAnchor href={PSN_API_URL}>psn-api</ExternalAnchor>.
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
    <details className="rounded-md border bg-muted/50 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline">
        Learn about the risk
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => signInWithToken({ data: { npsso: token } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["dashboard"], data);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
