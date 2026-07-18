import { Link, useRouteContext } from "@tanstack/react-router";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProfileSummary } from "@/server/providers/account/snapshot";
import { type CachedAccount, useCachedAccounts } from "@/stores/dashboard-store";

function AccountTrigger({ profile }: { profile: ProfileSummary }) {
  return (
    <PopoverTrigger
      render={
        <Button
          variant="ghost"
          className="min-w-0 px-2"
          aria-label={`Switch account, current account ${profile.onlineId}`}
        />
      }
    >
      <Avatar className="size-6">
        <AvatarImage src={profile.avatarUrl} alt="" />
        <AvatarFallback className="text-xs">
          {profile.onlineId.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{profile.onlineId}</span>
      <ChevronDown className="size-4" />
    </PopoverTrigger>
  );
}

function AccountOption({
  account,
  current,
  onSelect,
}: {
  account: CachedAccount;
  current: boolean;
  onSelect: (accountId: string) => void;
}) {
  return (
    <PopoverClose
      render={
        <Button
          variant="ghost"
          className="h-auto w-full justify-start p-2"
          aria-label={
            current ? `${account.onlineId}, current account` : `Switch to ${account.onlineId}`
          }
          aria-current={current ? "true" : undefined}
          onClick={() => onSelect(account.accountId)}
        />
      }
    >
      <Avatar className="size-8">
        <AvatarImage src={account.avatarUrl} alt="" />
        <AvatarFallback>{account.onlineId.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-left">{account.onlineId}</span>
      {current ? <Check className="size-4" aria-hidden="true" /> : null}
    </PopoverClose>
  );
}

export function AccountSwitcher({ profile }: { profile: ProfileSummary }) {
  const accounts = useCachedAccounts();
  const { dashboardStore } = useRouteContext({ from: "__root__" });

  if (accounts.length === 0) {
    return <span className="truncate font-semibold">{profile.onlineId}</span>;
  }

  return (
    <Popover>
      <AccountTrigger profile={profile} />
      <PopoverContent align="start" className="w-64 max-w-[calc(100vw-2rem)]">
        <PopoverTitle className="text-sm">Switch account</PopoverTitle>
        <div className="mt-2 space-y-1">
          {accounts.map((account) => (
            <AccountOption
              key={account.accountId}
              account={account}
              current={account.accountId === profile.accountId}
              onSelect={(accountId) => dashboardStore.setActive(accountId)}
            />
          ))}
        </div>
        <div className="mt-2 border-t pt-2">
          <Button variant="ghost" className="w-full justify-start" render={<Link to="/" />}>
            <UserPlus className="size-4" aria-hidden="true" />
            Add account
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
