import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithToken } from "@/server/psn";

const STEPS: Array<{ text: string; href?: string; linkText?: string }> = [
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
    text: 'Copy the 64-character value of "npsso" from that page and paste it below.',
  },
];

function Step({ index, text, href, linkText }: (typeof STEPS)[number] & { index: number }) {
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
    const token = npsso.trim();
    if (token) {
      signIn.mutate(token);
    } else {
      toast.error("Paste your npsso token first.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
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
        <ol className="space-y-3 text-sm">
          {STEPS.map((step, i) => (
            <Step key={step.text} index={i} {...step} />
          ))}
        </ol>
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
