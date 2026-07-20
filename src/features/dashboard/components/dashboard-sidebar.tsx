import { Link } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { demoDashboard } from "@/domain/mock";
import type { ProfileSummary } from "@/server/providers/account/snapshot";

const chapters = [
  {
    label: "Profile",
    sections: [
      ["overview", "Overview"],
      ["top-games", "Top games"],
      ["genres", "Genres"],
      ["franchises", "Franchises"],
      ["insights", "Insights"],
    ],
  },
  {
    label: "History",
    sections: [
      ["timeline", "Timeline"],
      ["sessions", "Sessions"],
      ["trophies", "Trophies"],
    ],
  },
  {
    label: "Spending",
    sections: [
      ["spending", "Summary"],
      ["purchase-history", "Purchase history"],
      ["spent-most", "Most spent"],
      ["add-ons", "Add-ons"],
      ["purchase-data", "Purchase import"],
    ],
  },
  { label: "Library", sections: [["library", "All games"]] },
  {
    label: "Tools",
    sections: [
      ["ask-ai", "Ask AI"],
      ["data-controls", "Data controls"],
    ],
  },
] as const;

const ids = chapters.flatMap((chapter) => chapter.sections.map(([id]) => id));

function activeSectionStore() {
  let active = "overview";
  let notify: (() => void) | undefined;
  return {
    subscribe: (onStoreChange: () => void) => {
      notify = onStoreChange;
      const observer = new IntersectionObserver(
        (entries) => {
          const first = entries
            .filter((entry) => entry.isIntersecting)
            .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (!first || first.target.id === active) return;
          active = first.target.id;
          notify?.();
        },
        { rootMargin: "-15% 0px -72%", threshold: 0 }
      );
      for (const id of ids) {
        const section = document.getElementById(id);
        if (section) observer.observe(section);
      }
      return () => {
        notify = undefined;
        observer.disconnect();
      };
    },
    getSnapshot: () => active,
    getServerSnapshot: () => "overview",
  };
}

function ChapterNav() {
  const [store] = useState(activeSectionStore);
  const active = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <nav
      aria-label={isMobile ? "Navigate Playloom" : "Dashboard chapters"}
      className="flex flex-col gap-5 px-6 py-3"
    >
      {chapters.map((chapter) => (
        <div className="flex flex-col" key={chapter.label}>
          <span
            className="mb-1.5 text-[0.6875rem] font-bold tracking-[0.14em] text-white/45 uppercase data-[active=true]:text-white/80"
            data-active={chapter.sections.some(([id]) => id === active)}
          >
            {chapter.label}
          </span>
          {chapter.sections.map(([id, label]) => (
            <a
              className="flex min-h-10 items-center border-l border-white/15 px-3 text-[0.8125rem] text-white/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7599f4] hover:text-white aria-[current=location]:border-[#7599f4] aria-[current=location]:bg-[linear-gradient(90deg,rgb(49_91_191/22%),transparent)] aria-[current=location]:text-white"
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              data-active={active === id}
              onClick={() => {
                if (isMobile) setOpenMobile(false);
              }}
            >
              {label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SpineHeader({ profile }: { profile: ProfileSummary }) {
  return (
    <SidebarHeader className="gap-4 px-6 pt-7 pb-5">
      <Link
        className="w-fit font-[Fraunces_Variable] text-[1.9375rem] font-semibold tracking-[-0.04em] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7599f4]"
        to="/"
        aria-label="Playloom — go to home page"
      >
        Playloom
      </Link>
      <p className="font-[Fraunces_Variable] text-[0.8125rem] leading-[1.35] text-white/60">
        Your gaming life,
        <br />
        woven together.
      </p>
      <div className="mt-2 grid grid-cols-[2.25rem_1fr] items-center gap-2.5 border-t border-white/15 pt-4">
        <span className="grid aspect-square place-items-center bg-[#f5efe2] text-[0.6875rem] font-bold text-[var(--playloom-ink)]">
          {profile.onlineId.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col text-xs">
          <strong className="truncate">{profile.onlineId}</strong>
          <small className="text-white/50">Personal profile</small>
        </div>
      </div>
    </SidebarHeader>
  );
}

function SpineFooter() {
  return (
    <SidebarFooter className="gap-3 px-6 py-5 text-[0.6875rem] leading-[1.45] text-white/50">
      <a
        className="text-white/70 underline underline-offset-3"
        href="https://rawg.io"
        target="_blank"
        rel="noreferrer"
      >
        Game metadata and artwork provided by RAWG
      </a>
    </SidebarFooter>
  );
}

export function DashboardSidebar({
  profile = demoDashboard.profile,
}: {
  profile?: ProfileSummary;
}) {
  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-0 bg-[var(--playloom-ink)] text-[#f5efe2] [&_[data-slot=sidebar-inner]]:border-0 [&_[data-slot=sidebar-inner]]:bg-[var(--playloom-ink)]"
      mobileTitle="Navigate Playloom"
      mobileDescription="Choose a dashboard chapter. Every destination is available in this scrollable drawer."
    >
      <SpineHeader profile={profile} />
      <SidebarContent className="min-h-0 overflow-y-auto overscroll-contain pb-6">
        <ChapterNav />
      </SidebarContent>
      <SpineFooter />
    </Sidebar>
  );
}
