import { createFileRoute } from "@tanstack/react-router";
import { RestoreDashboardCard } from "@/features/onboarding/components/restore-dashboard-card";
import { SignInCard } from "@/features/onboarding/components/sign-in-card";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const TITLE = "PSN Playtime — PlayStation Playtime Tracker & PSN Hours Visualizer";
const DESCRIPTION =
  "Free PlayStation playtime tracker. Visualise your PSN hours and see your top games, genres and franchises from your real play history — no spreadsheets required.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  image: OG_IMAGE,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { "script:ld+json": jsonLd },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 p-6">
      <div className="space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">PSN Playtime</h1>
        <p className="text-lg text-muted-foreground">
          Turn your PlayStation history into a clear picture of how you actually play.
        </p>
      </div>
      <SignInCard />
      <RestoreDashboardCard />
    </main>
  );
}
