import { Info } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { fmtRelative } from "../format";

const CACHE_EXPLANATION =
  "Your data is cached in this browser from when you last signed in, so it may be behind your latest activity.";

/**
 * Subtle freshness signal for the dashboard. Real data shows when it was last
 * pulled from PSN plus a tooltip explaining the browser cache. Demo data is
 * labelled, never given a fake time.
 */
export function CachedDataIndicator({ data }: { data: DashboardData }) {
  if (data.isDemo) {
    return <span className="text-xs text-muted-foreground">Demo data, not a live PSN pull</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        Updated {fmtRelative(data.fetchedAt)}
      </TooltipTrigger>
      <TooltipPopup side="bottom" className="max-w-xs">
        {CACHE_EXPLANATION}
      </TooltipPopup>
    </Tooltip>
  );
}
