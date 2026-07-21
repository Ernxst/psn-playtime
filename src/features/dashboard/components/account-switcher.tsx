import { Link, useRouteContext } from "@tanstack/react-router";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProfileSummary } from "@/server/providers/account/snapshot";
import { type CachedAccount, useAvailableAccounts } from "@/stores/dashboard-store";

function AccountAvatar({ account }: { account: CachedAccount }) {
  return (
    <Avatar className="size-8 rounded-none">
      <AvatarImage src={account.avatarUrl} alt={`${account.onlineId} avatar`} />
      <AvatarFallback className="rounded-none bg-primary text-xs text-primary-foreground">
        {account.onlineId.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function AccountTrigger({ profile, capture }: { profile: ProfileSummary; capture: () => void }) {
  const source = profile.sourceLabel ?? "Imported from PlayStation";
  return (
    <span
      className="flex h-11 items-center"
      onPointerDownCapture={capture}
      onKeyDownCapture={capture}
      onClickCapture={capture}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="h-11 min-w-0 rounded-none px-2 text-foreground active:scale-[0.96] hover:bg-accent focus-visible:ring-ring sm:h-11 max-sm:w-11 max-sm:justify-center max-sm:px-1"
            aria-label={`Switch account, current account ${profile.onlineId}`}
          />
        }
      >
        <Avatar className="size-8 shrink-0 rounded-none">
          <AvatarImage src={profile.avatarUrl} alt={`${profile.onlineId} avatar`} />
          <AvatarFallback className="rounded-none bg-primary text-xs text-primary-foreground">
            {profile.onlineId.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col items-start leading-[1.1] max-sm:sr-only">
          <strong className="max-w-35 truncate">{profile.onlineId}</strong>
          <small className="max-w-40 truncate text-[0.625rem] font-normal text-muted-foreground">
            {source}
          </small>
        </span>
        <ChevronDown className="size-4 shrink-0 max-sm:hidden" aria-hidden="true" />
      </PopoverTrigger>
    </span>
  );
}

function accountAction(account: CachedAccount, current: boolean): string {
  if (current) return `${account.onlineId}, current account`;
  return `Switch to ${account.onlineId}`;
}

function CurrentLabel({ current }: { current: boolean }) {
  return (
    <small
      className="invisible shrink-0 text-[0.5625rem] font-bold tracking-[0.1em] text-primary uppercase data-[current=true]:visible"
      data-current={current}
      aria-hidden={!current}
    >
      Current
    </small>
  );
}

function CurrentCheck({ current }: { current: boolean }) {
  return (
    <Check
      className="invisible size-4 data-[current=true]:visible"
      data-current={current}
      aria-label="Current account"
      aria-hidden={!current}
    />
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
        <button
          type="button"
          className="grid min-h-13 w-full grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-2.5 px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          aria-label={accountAction(account, current)}
          aria-current={current}
          onClick={() => onSelect(account.accountId)}
        />
      }
    >
      <AccountAvatar account={account} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm">{account.onlineId}</strong>
          <CurrentLabel current={current} />
        </span>
        <small className="truncate text-[0.6875rem] text-muted-foreground">
          {account.sourceLabel}
        </small>
      </span>
      <CurrentCheck current={current} />
    </PopoverClose>
  );
}

function AccountMenu({ profile }: { profile: ProfileSummary }) {
  const accounts = useAvailableAccounts();
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return (
    <PopoverContent
      align="end"
      sideOffset={6}
      className="w-72 max-w-[calc(100vw-1.5rem)] rounded-none border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] p-0 text-foreground shadow-[0_12px_30px_var(--playloom-shadow)] transition-none before:rounded-none data-starting-style:opacity-100 [&_[data-slot=popover-viewport]]:p-0"
    >
      <div className="border-b border-[var(--playloom-rule-strong)] p-3">
        <PopoverTitle className="font-[Fraunces_Variable] text-lg font-semibold">
          Switch account
        </PopoverTitle>
        <PopoverDescription className="mt-1 text-xs">
          Choose the account shown in Playloom.
        </PopoverDescription>
      </div>
      <div className="grid gap-0.5 p-1.5">
        {accounts.map((account) => (
          <AccountOption
            key={account.accountId}
            account={account}
            current={account.accountId === profile.accountId}
            onSelect={(accountId) => dashboardStore.setActive(accountId)}
          />
        ))}
      </div>
      <div className="border-t border-[var(--playloom-rule-strong)] p-1.5">
        <Button
          variant="ghost"
          className="min-h-11 w-full justify-start rounded-none px-2 text-foreground hover:bg-accent"
          render={<Link to="/" hash="connect" />}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Add PlayStation account
        </Button>
      </div>
    </PopoverContent>
  );
}

export function AccountSwitcher({ profile }: { profile: ProfileSummary }) {
  const [open, setOpen] = useState(false);
  const scroll = useRef(0);
  const restoreScroll = () => window.scrollTo(0, scroll.current);
  const preserveScroll = (next: boolean) => {
    setOpen(next);
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  };
  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={preserveScroll}
      onOpenChangeComplete={restoreScroll}
    >
      <AccountTrigger profile={profile} capture={() => (scroll.current = window.scrollY)} />
      <AccountMenu profile={profile} />
    </Popover>
  );
}
