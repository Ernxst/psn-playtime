import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function SubmitButton({ pending }: { pending: boolean }) {
  if (pending) {
    return (
      <Button type="submit" disabled>
        <Loader2 className="size-4 animate-spin" /> Signing in…
      </Button>
    );
  }
  return (
    <Button type="submit">
      Sign in <ArrowRight className="size-4" />
    </Button>
  );
}

function TokenForm() {
  const [npsso, setNpsso] = useState("");
  const signIn = useSignIn();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = normalizeNpsso(npsso);
    if (token) {
      signIn.mutate(token);
    } else {
      toast.error("Paste your npsso token first.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="flex items-center gap-2 text-destructive text-xs font-medium">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
        Treat this token like a password. Never share it or post a screenshot of it.
      </p>
      <Label htmlFor="npsso">npsso token</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="npsso"
          value={npsso}
          onChange={(e) => setNpsso(e.target.value)}
          placeholder="Paste your 64-character npsso value"
          autoComplete="off"
          spellCheck={false}
          disabled={signIn.isPending}
        />
        <SubmitButton pending={signIn.isPending} />
      </div>
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
