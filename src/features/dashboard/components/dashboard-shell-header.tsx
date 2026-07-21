import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingActions() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <Skeleton className="size-10 rounded-none sm:w-21" />
      <Skeleton className="size-10 rounded-none sm:w-21" />
      <Skeleton className="size-11 rounded-none sm:w-45" />
    </div>
  );
}

export function DashboardShellHeader({
  children,
  loading = false,
}: {
  children?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex h-15 items-center gap-2 border-b border-[var(--playloom-rule)] bg-[rgb(243_239_229/96%)] px-5 backdrop-blur-md max-sm:px-3"
      data-slot="dashboard-shell-header"
    >
      <SidebarTrigger className="size-11 md:hidden" aria-label="Open chapter navigation" />
      <Link
        className="font-[Fraunces_Variable] text-xl font-semibold tracking-[-0.035em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        to="/"
        aria-label="Playloom — go to home page"
      >
        Playloom
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        {loading ? <LoadingActions /> : children}
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-none active:scale-[0.96] sm:size-10"
          render={
            <Link to="/" aria-label="Go to Playloom home">
              <Home />
            </Link>
          }
        />
      </div>
    </header>
  );
}
