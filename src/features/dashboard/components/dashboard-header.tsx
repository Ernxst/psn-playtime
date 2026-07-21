import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { fmtNumber } from "../format";
import { CachedDataIndicator } from "./cached-data-indicator";
import { RefreshDashboard } from "./refresh-dashboard";

interface Props {
  data: DashboardData;
  onRefresh?: (npsso: string) => Promise<void>;
  onSignOut?: () => void;
  signingOut: boolean;
}

function HeaderRefresh({ onRefresh }: Pick<Props, "onRefresh">) {
  if (!onRefresh) return null;
  return <RefreshDashboard onRefresh={onRefresh} />;
}

function HeaderSignOut({ onSignOut, signingOut }: Omit<Props, "data" | "onRefresh">) {
  if (!onSignOut) return null;
  return (
    <Button variant="outline" onClick={onSignOut} disabled={signingOut}>
      <LogOut className="size-4" />
      {signingOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}

function HeaderActions({ onRefresh, onSignOut, signingOut }: Omit<Props, "data">) {
  if (!onRefresh && !onSignOut) return null;
  return (
    <div className="flex gap-2">
      <HeaderRefresh onRefresh={onRefresh} />
      <HeaderSignOut onSignOut={onSignOut} signingOut={signingOut} />
    </div>
  );
}

export function DashboardHeader({ data, onRefresh, onSignOut, signingOut }: Props) {
  const { profile } = data;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar className="size-14 rounded-none">
          <AvatarImage src={profile.avatarUrl} alt={`${profile.onlineId} avatar`} />
          <AvatarFallback className="rounded-none">
            {profile.onlineId.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{profile.onlineId}</h1>
            {profile.isPlus ? <Badge variant="secondary">PS Plus</Badge> : null}
            <Badge>{profile.sourceLabel ?? "Imported from PlayStation"}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Trophy level {fmtNumber(profile.trophyLevel)}</span>
            <Progress value={profile.levelProgress} className="h-1.5 w-24" />
            <span>{profile.levelProgress}% to next</span>
          </div>
          <CachedDataIndicator data={data} />
        </div>
      </div>
      <HeaderActions onRefresh={onRefresh} onSignOut={onSignOut} signingOut={signingOut} />
    </header>
  );
}
