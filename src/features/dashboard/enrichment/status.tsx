import { Button } from "@/components/ui/button";
import type { EnrichmentViewStatus } from "./state";

export interface EnrichmentStatusControl {
  readonly status: EnrichmentViewStatus;
  readonly retrying: boolean;
  readonly onRetry?: () => void;
}

export interface DashboardEnrichmentPresentation {
  readonly genres: EnrichmentStatusControl;
  readonly franchises: EnrichmentStatusControl;
}

type MetadataKind = "genres" | "franchises";

const messages: Record<MetadataKind, Record<Exclude<EnrichmentViewStatus, "complete">, string>> = {
  genres: {
    pending: "Checking RAWG for genre metadata. PlayStation play data remains unchanged.",
    partial:
      "Some genre metadata is still missing. Showing only the RAWG matches available for this account.",
    unavailable:
      "Genre metadata is unavailable in this deployment. PlayStation play data remains unchanged.",
    failed: "RAWG could not load genre metadata. PlayStation play data remains unchanged.",
  },
  franchises: {
    pending: "Checking RAWG for franchise metadata. PlayStation play data remains unchanged.",
    partial:
      "Some franchise metadata is still missing. Showing only the RAWG matches available for this account.",
    unavailable:
      "Franchise metadata is unavailable in this deployment. PlayStation play data remains unchanged.",
    failed: "RAWG could not load franchise metadata. PlayStation play data remains unchanged.",
  },
};

const retryLabels: Record<MetadataKind, string> = {
  genres: "Retry genre metadata",
  franchises: "Retry franchise metadata",
};

const retryingMessages: Record<MetadataKind, string> = {
  genres: "Retrying genre metadata. Showing the available RAWG matches.",
  franchises: "Retrying franchise metadata. Showing the available RAWG matches.",
};

function messageFor(kind: MetadataKind, control: EnrichmentStatusControl): string {
  if (control.status === "complete") return "";
  if (control.retrying) return retryingMessages[kind];
  return messages[kind][control.status];
}

export function EnrichmentStatusNotice({
  kind,
  control,
}: {
  readonly kind: MetadataKind;
  readonly control: EnrichmentStatusControl;
}) {
  if (control.status === "complete") return null;
  const retryable = control.status === "partial" || control.status === "failed";
  return (
    <output
      className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] p-4"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={control.retrying}
    >
      <span className="text-xs leading-relaxed text-muted-foreground">
        {messageFor(kind, control)}
      </span>
      {retryable && control.onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={control.retrying}
          onClick={control.onRetry}
        >
          {retryLabels[kind]}
        </Button>
      ) : null}
    </output>
  );
}
