import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { SITE_NAME, SITE_URL } from "../lib/seo";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

const DEFAULT_TITLE = "PSN Playtime — your PlayStation history, visualised";
const DEFAULT_DESCRIPTION =
  "Turn your PlayStation play history into clear charts: top games, genres, franchises and more.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

const rootMeta = [
  { charSet: "utf-8" },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
  { title: DEFAULT_TITLE },
  { name: "description", content: DEFAULT_DESCRIPTION },
  { name: "theme-color", content: "#0b0f1a" },
  // Open Graph defaults
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:type", content: "website" },
  { property: "og:locale", content: "en_US" },
  { property: "og:title", content: DEFAULT_TITLE },
  { property: "og:description", content: DEFAULT_DESCRIPTION },
  { property: "og:url", content: SITE_URL },
  { property: "og:image", content: OG_IMAGE },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  // Twitter card defaults
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: DEFAULT_TITLE },
  { name: "twitter:description", content: DEFAULT_DESCRIPTION },
  { name: "twitter:image", content: OG_IMAGE },
];

const rootLinks = [
  { rel: "stylesheet", href: appCss },
  { rel: "canonical", href: SITE_URL },
  { rel: "icon", href: "/favicon.ico" },
  { rel: "manifest", href: "/manifest.json" },
];

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: rootMeta,
    links: rootLinks,
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
