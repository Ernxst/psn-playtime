import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { fmtNumber } from "../format";
import { CachedDataIndicator } from "./cached-data-indicator";

interface Props {
  data: DashboardData;
  onSignOut: () => void;
  signingOut: boolean;
}

export function DashboardHeader({ data, onSignOut, signingOut }: Props) {
  const { profile } = data;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarImage src={profile.avatarUrl} alt={profile.onlineId} />
          <AvatarFallback>{profile.onlineId.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{profile.onlineId}</h1>
            {profile.isPlus ? <Badge variant="secondary">PS Plus</Badge> : null}
            {data.isDemo ? <Badge>Demo</Badge> : null}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Trophy level {fmtNumber(profile.trophyLevel)}</span>
            <Progress value={profile.levelProgress} className="h-1.5 w-24" />
            <span>{profile.levelProgress}% to next</span>
          </div>
          <CachedDataIndicator data={data} />
        </div>
      </div>
      {!data.isDemo ? (
        <Button variant="outline" onClick={onSignOut} disabled={signingOut}>
          <LogOut className="size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      ) : null}
    </header>
  );
}
