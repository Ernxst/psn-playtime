import { useState, useSyncExternalStore } from "react";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar";

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

export const dashboardSectionIds = chapters.flatMap((chapter) =>
  chapter.sections.map(([id]) => id)
);

function hashSection(): string | undefined {
  const id = window.location.hash.slice(1);
  return dashboardSectionIds.some((sectionId) => sectionId === id) ? id : undefined;
}

export function alignHashDestination(): void {
  const id = hashSection();
  if (!id) return;
  const align = () => document.getElementById(id)?.scrollIntoView();
  align();
  window.requestAnimationFrame(() => window.requestAnimationFrame(align));
}

function activeSectionStore() {
  let active = "overview";
  let notify: (() => void) | undefined;
  return {
    subscribe: (onStoreChange: () => void) => {
      notify = onStoreChange;
      const hashed = hashSection();
      if (hashed) active = hashed;
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
      for (const id of dashboardSectionIds) {
        const section = document.getElementById(id);
        if (section) observer.observe(section);
      }
      return () => {
        notify = undefined;
        observer.disconnect();
      };
    },
    activate: (id: string) => {
      if (id === active) return;
      active = id;
      notify?.();
    },
    getSnapshot: () => active,
    getServerSnapshot: () => "overview",
  };
}

function ChapterLink({
  id,
  label,
  active,
  onActivate,
}: {
  id: string;
  label: string;
  active: boolean;
  onActivate: () => void;
}) {
  const { closeMobile, isMobile } = useSidebar();
  return (
    <a
      className="flex min-h-10 items-center border-l border-white/15 px-3 text-[0.8125rem] text-white/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7599f4] hover:text-white aria-[current=location]:border-[#7599f4] aria-[current=location]:bg-[linear-gradient(90deg,rgb(49_91_191/22%),transparent)] aria-[current=location]:text-white [@media(pointer:coarse)]:min-h-11"
      href={`#${id}`}
      aria-current={active ? "location" : undefined}
      data-active={active}
      onClick={() => {
        onActivate();
        if (isMobile) {
          closeMobile(() => {
            const target = document.getElementById(id);
            target?.scrollIntoView();
            target?.focus({ preventScroll: true });
          });
        }
      }}
    >
      {label}
    </a>
  );
}

function ChapterNav() {
  const [store] = useState(activeSectionStore);
  const active = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { isMobile } = useSidebar();
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
            <ChapterLink
              key={id}
              id={id}
              label={label}
              active={active === id}
              onActivate={() => store.activate(id)}
            />
          ))}
        </div>
      ))}
    </nav>
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

export function DashboardSidebar() {
  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-0 bg-[var(--playloom-ink)] text-[#f5efe2]"
      mobileTitle="Navigate Playloom"
      mobileDescription="Choose a dashboard chapter. Every destination is available in this scrollable drawer."
    >
      <SidebarContent className="min-h-0 overflow-y-auto overscroll-contain pt-7 pb-6">
        <ChapterNav />
      </SidebarContent>
      <SpineFooter />
    </Sidebar>
  );
}
