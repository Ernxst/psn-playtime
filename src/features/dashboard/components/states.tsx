import { Link } from "@tanstack/react-router";
import { AlertTriangle, Archive, Gamepad2, SearchX } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProfileSummary } from "@/server/providers/account/snapshot";
import { AccountSwitcher } from "./account-switcher";
import { DashboardShellHeader } from "./dashboard-shell-header";
import { DashboardSidebar } from "./dashboard-sidebar";

function StateShell({
  children,
  busy = false,
  profile,
}: {
  children: React.ReactNode;
  busy?: boolean;
  profile?: ProfileSummary;
}) {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset
        className="min-w-0 overflow-x-clip bg-[var(--playloom-paper)]"
        aria-busy={busy || undefined}
      >
        <DashboardShellHeader loading={busy}>
          {profile ? <AccountSwitcher profile={profile} /> : null}
        </DashboardShellHeader>
        <div className="min-h-[calc(100dvh-3.75rem)] bg-[var(--playloom-paper)] text-[var(--playloom-ink)]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function DashboardSkeleton({ profile }: { profile?: ProfileSummary } = {}) {
  return (
    <StateShell busy profile={profile}>
      <div className="px-[clamp(1.25rem,5vw,4rem)] py-8">
        <output className="sr-only" aria-live="polite">
          Loading PlayStation archive
        </output>
        <div aria-hidden="true" className="grid gap-8">
          <div className="grid gap-3">
            <Skeleton className="h-4 w-28 rounded-none" />
            <Skeleton className="h-16 w-72 max-w-full rounded-none" />
            <Skeleton className="h-4 w-64 max-w-full rounded-none" />
          </div>
          <div className="grid grid-cols-2 gap-4 border-y border-[var(--playloom-rule)] py-5 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-none" />
            ))}
          </div>
          <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
            <Skeleton className="aspect-[2/3] rounded-none" />
            <Skeleton className="h-44 rounded-none" />
          </div>
        </div>
      </div>
    </StateShell>
  );
}

function ErrorActions({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {onRetry && (
        <Button className="min-h-11 rounded-none" onClick={onRetry}>
          Try again
        </Button>
      )}
      <Button variant="outline" className="min-h-11 rounded-none" render={<Link to="/" />}>
        Home
      </Button>
    </div>
  );
}

function focusHeading(heading: HTMLHeadingElement | null): void {
  heading?.focus();
}

export function DashboardError({
  message,
  onRetry,
  profile,
}: {
  message: string;
  onRetry?: () => void;
  profile?: ProfileSummary;
}) {
  return (
    <StateShell profile={profile}>
      <section
        className="mx-auto grid min-h-[calc(100dvh-3.75rem)] max-w-3xl content-center gap-6 px-6 py-16"
        role="alert"
        aria-labelledby="dashboard-error-title"
      >
        <AlertTriangle className="size-9 text-primary" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            Archive interrupted
          </p>
          <h1
            id="dashboard-error-title"
            ref={focusHeading}
            tabIndex={-1}
            className="font-[Fraunces_Variable] text-[clamp(2.5rem,6vw,4.5rem)] font-semibold tracking-[-0.055em] leading-none"
          >
            Couldn't load this archive
          </h1>
          <p className="max-w-[60ch] text-muted-foreground">{message}</p>
          <p className="text-sm">Your saved browser data is unchanged.</p>
        </div>
        <ErrorActions onRetry={onRetry} />
      </section>
    </StateShell>
  );
}

export function DashboardEmpty() {
  return (
    <section className="px-[clamp(1.25rem,5vw,4rem)] py-8" aria-labelledby="empty-title">
      <Empty className="items-start rounded-none border-y border-[var(--playloom-rule-strong)] bg-transparent px-0 text-left">
        <EmptyHeader className="items-start">
          <EmptyMedia className="rounded-none bg-primary text-primary-foreground" variant="icon">
            <Gamepad2 />
          </EmptyMedia>
          <h2 id="empty-title" className="font-[Fraunces_Variable] text-3xl font-semibold">
            No PlayStation games found
          </h2>
          <EmptyDescription>
            Connect or restore an account, then refresh the archive to bring its games into
            Playloom.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-start">
          <Button className="min-h-11 rounded-none" render={<Link to="/" />}>
            Connect PlayStation
          </Button>
          <Button variant="outline" className="min-h-11 rounded-none" render={<Link to="/" />}>
            Restore an archive
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}

export function DashboardPartialNotice() {
  return (
    <aside
      className="mx-[clamp(1.25rem,5vw,4rem)] mt-6 grid gap-2 border-y border-[var(--playloom-rule-strong)] py-4 text-sm"
      aria-labelledby="partial-data-title"
    >
      <div className="flex items-center gap-2">
        <Archive className="size-4 text-primary" aria-hidden="true" />
        <h2 id="partial-data-title" className="font-bold">
          This archive has partial PlayStation data
        </h2>
      </div>
      <p className="text-muted-foreground">
        Sessions, franchises, trophies, artwork enrichment, and purchase transactions are
        unavailable. Playloom shows the data that exists without estimating missing values.
      </p>
    </aside>
  );
}

export function DashboardNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <section className="px-[clamp(1.25rem,5vw,4rem)] py-12" aria-labelledby="no-results-title">
      <Empty className="rounded-none border-y border-[var(--playloom-rule-strong)] bg-transparent">
        <EmptyHeader>
          <EmptyMedia className="rounded-none" variant="icon">
            <SearchX />
          </EmptyMedia>
          <h2 id="no-results-title" className="font-[Fraunces_Variable] text-2xl font-semibold">
            No games match your filters
          </h2>
          <EmptyDescription>
            Widen the timeframe or remove a filter to see more of your library.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button className="min-h-11 rounded-none" variant="outline" onClick={onClear}>
            Clear all filters
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}
