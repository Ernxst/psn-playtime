import { createFileRoute } from "@tanstack/react-router";
import { SecurityCallout } from "@/components/onboarding/security-callout";
import { SignInCard } from "@/components/onboarding/sign-in-card";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 p-6">
      <div className="space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">PSN Playtime</h1>
        <p className="text-lg text-muted-foreground">
          Turn your PlayStation history into a clear picture of how you actually play.
        </p>
      </div>
      <SecurityCallout />
      <SignInCard />
    </main>
  );
}
