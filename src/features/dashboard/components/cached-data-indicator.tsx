import { Info } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { fmtRelative } from "../format";

const CACHE_EXPLANATION =
  "Your data is cached in this browser from your last sign-in or refresh, so it may be behind your latest activity.";

/** Subtle freshness signal for the selected dashboard snapshot. */
export function CachedDataIndicator({ data }: { data: DashboardData }) {
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
