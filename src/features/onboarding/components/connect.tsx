import { useLocation } from "@tanstack/react-router";
import { SignInCard } from "@/features/onboarding/components/sign-in-card";

export function Connect() {
  const hash = useLocation({ select: (location) => location.hash });
  const focusTitle = (title: HTMLHeadingElement | null) => {
    if (title && hash === "connect") title.focus();
  };
  return (
    <section id="connect" className="playloom-connect !block" aria-labelledby="connect-title">
      <div className="mx-auto max-w-5xl">
        <span>Connect</span>
        <h2 id="connect-title" tabIndex={-1} ref={focusTitle}>
          Bring in your PlayStation history.
        </h2>
        <p>
          The demo shows the kind of archive you can build. Connecting PlayStation remains available
          as a separate, deliberate task.
        </p>
        <details className="group mt-10 border-y border-[var(--playloom-rule-strong)]">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--playloom-cobalt)] [&::-webkit-details-marker]:hidden">
            <span>
              <strong className="block text-base">Connect PlayStation</strong>
              <span className="mt-1 block text-sm text-[#5e6268]">
                Load your own history with a one-time token.
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-[var(--playloom-cobalt)] group-open:hidden">
              Show connection
            </span>
            <span className="hidden shrink-0 text-sm font-medium text-[var(--playloom-cobalt)] group-open:block">
              Hide connection
            </span>
          </summary>
          <SignInCard showDemoLink={false} />
        </details>
      </div>
    </section>
  );
}
