import { useLocation } from "@tanstack/react-router";
import { SignInCard } from "@/features/onboarding/components/sign-in-card";

export function Connect() {
  const hash = useLocation({ select: (location) => location.hash });
  const focusTitle = (title: HTMLHeadingElement | null) => {
    if (title && hash === "connect") title.focus();
  };
  return (
    <section id="connect" className="playloom-connect" aria-labelledby="connect-title">
      <div>
        <span>Connect</span>
        <h2 id="connect-title" tabIndex={-1} ref={focusTitle}>
          Bring in your PlayStation history.
        </h2>
        <p>
          One guided flow using the existing token steps and acknowledgement. No other platform
          connection is implied.
        </p>
      </div>
      <SignInCard showDemoLink={false} />
    </section>
  );
}
