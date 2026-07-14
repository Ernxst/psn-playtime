import { Info } from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import { playProfile } from "@/features/dashboard/profile/profile";
import type { DashboardData } from "@/server/providers/account/snapshot";

export function ProfileSummary({ data }: { data: DashboardData }) {
  const profile = useMemo(() => playProfile(data), [data]);
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-card to-muted/35">
      <CardContent className="space-y-5 p-6 sm:p-8">
        <div className="space-y-3 text-pretty text-base leading-7 sm:text-lg">
          <p>{profile.centre}</p>
          {profile.span ? <p>{profile.span}</p> : null}
          {profile.trophies ? <p>{profile.trophies}</p> : null}
        </div>
        {profile.trophyNotice ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{profile.trophyNotice}</span>
          </p>
        ) : null}
        <CopyButton value={profile.copy} label="Copy profile summary" />
      </CardContent>
    </Card>
  );
}
