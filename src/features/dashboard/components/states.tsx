import { AlertTriangle, Gamepad2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-10 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Couldn't load your data</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function DashboardEmpty() {
  return (
    <Empty className="rounded-xl border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Gamepad2 />
        </EmptyMedia>
        <EmptyTitle>No games yet</EmptyTitle>
        <EmptyDescription>We couldn't find any played titles on this account.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function DashboardNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <Empty className="rounded-xl border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>No games match your filters</EmptyTitle>
        <EmptyDescription>
          Try widening the timeframe or removing a filter to see more of your library.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onClear}>
          Clear all filters
        </Button>
      </EmptyContent>
    </Empty>
  );
}
