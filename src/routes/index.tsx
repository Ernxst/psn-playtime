import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoDashboard } from "@/domain/mock";
import { headlineTotals } from "@/features/dashboard/filters/analytics";
import { fmtHours, fmtNumber } from "@/features/dashboard/format";
import { RestoreDashboardCard } from "@/features/onboarding/components/restore-dashboard-card";
import { SignInCard } from "@/features/onboarding/components/sign-in-card";
import { GamePoster } from "@/features/prototype/poster";
import { SITE_URL } from "@/lib/seo";

const TITLE = "Playloom — Your gaming life, woven together";
const DESCRIPTION = "A personal gaming archive that makes your PlayStation history visible.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: SITE_URL },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Home,
});

function DemoProof() {
  const games = demoDashboard.games.slice(0, 5);
  const totals = headlineTotals(demoDashboard);
  return (
    <section className="playloom-onboarding-proof" aria-labelledby="proof-title">
      <div className="playloom-proof-copy">
        <span>Meet the archive</span>
        <h2 id="proof-title">See a gaming life before connecting yours.</h2>
        <p>
          Ernxst_ has crossed 7,600 hours, but the stronger story is the rhythm: long competitive
          eras, survival-world returns, and nine platinum finishes spread across the years.
        </p>
        <div className="playloom-proof-metrics">
          <strong>
            {fmtHours(totals.totalHours)}
            <small>Lifetime play</small>
          </strong>
          <strong>
            {fmtNumber(totals.gamesPlayed)}
            <small>Games</small>
          </strong>
          <strong>
            {fmtNumber(demoDashboard.profile.earned.platinum)}
            <small>Platinums</small>
          </strong>
        </div>
        <Button size="lg" render={<Link to="/dashboard" />}>
          Explore the demo <ArrowRight />
        </Button>
      </div>
      <div className="playloom-proof-posters" aria-label="Demo profile game artwork">
        {games.map((game, index) => (
          <div key={game.titleId}>
            <GamePoster game={game} featured={index === 0} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="playloom-onboarding-trust" aria-labelledby="trust-title">
      <LockKeyhole />
      <div>
        <h2 id="trust-title">Your token is a key. We treat it like one.</h2>
        <p>
          An NPSSO token is password-equivalent. It is sent once through the server to PlayStation,
          never stored, and the dashboard data returned stays in your browser.
        </p>
      </div>
      <details>
        <summary>
          Read the connection details <ChevronDown />
        </summary>
        <p>
          PlayStation is the only supported import source today. Playloom reads your profile, played
          titles and trophies; platform accounts remain connected sources beneath one personal
          profile.
        </p>
      </details>
    </section>
  );
}

function Home() {
  return (
    <main className="playloom-onboarding">
      <OnboardingHeader />
      <OnboardingHero />
      <DemoProof />
      <Trust />
      <Connect />
      <Restore />
      <OnboardingFooter />
    </main>
  );
}

function OnboardingHero() {
  return (
    <section className="playloom-onboarding-hero">
      <p>A personal gaming archive</p>
      <h1>
        Your gaming life,
        <br />
        <em>woven together.</em>
      </h1>
      <span>
        Bring PlayStation histories into one visual record of what you played, when it mattered and
        how your tastes changed.
      </span>
      <Button size="lg" render={<Link to="/dashboard" />}>
        Explore the demo <ArrowRight />
      </Button>
    </section>
  );
}

function Connect() {
  return (
    <section className="playloom-connect" aria-labelledby="connect-title">
      <div>
        <span>Connect</span>
        <h2 id="connect-title">Bring in your PlayStation history.</h2>
        <p>
          One guided flow using the existing token steps and acknowledgement. No other platform
          connection is implied.
        </p>
      </div>
      <SignInCard showDemoLink={false} />
    </section>
  );
}

function Restore() {
  return (
    <section className="playloom-restore" aria-labelledby="restore-title">
      <div>
        <span>Already exported?</span>
        <h2 id="restore-title">Restore your archive once.</h2>
      </div>
      <RestoreDashboardCard />
    </section>
  );
}

function OnboardingHeader() {
  return (
    <header className="playloom-onboarding-nav">
      <Link to="/" aria-label="Playloom home">
        Playloom
      </Link>
      <span>Prototype · Issue #327</span>
    </header>
  );
}

function OnboardingFooter() {
  return (
    <footer className="playloom-onboarding-footer">
      <strong>Playloom</strong>
      <span>Your gaming life, woven together.</span>
      <small>Temporary text wordmark · final square brandmark deferred</small>
    </footer>
  );
}
