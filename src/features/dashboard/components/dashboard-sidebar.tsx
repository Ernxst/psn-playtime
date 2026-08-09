import { useState, useSyncExternalStore } from "react";
import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";

const NAVIGATION_EDGE = 24;
const READING_LINE = 96;

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
  if (typeof window === "undefined") return undefined;
  const id = window.location.hash.slice(1);
  return dashboardSectionIds.some((sectionId) => sectionId === id) ? id : undefined;
}

export function alignHashDestination(): void {
  const id = hashSection();
  if (!id) return;
  const align = () => {
    if (hashSection() === id) document.getElementById(id)?.scrollIntoView();
  };
  align();
  window.requestAnimationFrame(() => window.requestAnimationFrame(align));
}

type ActiveSectionState = {
  active: string;
  observed?: string;
  requested?: string;
  notify?: () => void;
};

function keepSectionLinkVisible(id: string): void {
  const link = document.querySelector<HTMLElement>(`[data-dashboard-section="${id}"]`);
  const navigation = link?.closest<HTMLElement>('[data-slot="sidebar-content"]');
  if (!link || !navigation) return;
  const linkRect = link.getBoundingClientRect();
  const navigationRect = navigation.getBoundingClientRect();
  const top = navigationRect.top + NAVIGATION_EDGE;
  const bottom = navigationRect.bottom - NAVIGATION_EDGE;
  if (linkRect.top < top) navigation.scrollTop -= Math.ceil(top - linkRect.top);
  if (linkRect.bottom > bottom) navigation.scrollTop += Math.ceil(linkRect.bottom - bottom);
}

function settleRequestedSection(state: ActiveSectionState): void {
  const requested = state.requested;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (state.requested !== requested) return;
      state.requested = undefined;
      const observed = state.observed;
      state.observed = undefined;
      if (observed) activateSection(state, observed, false);
    });
  });
}

function activateSection(state: ActiveSectionState, id: string, requested: boolean): void {
  const changed = state.active !== id;
  state.active = id;
  state.requested = requested ? id : undefined;
  if (requested) settleRequestedSection(state);
  if (changed) state.notify?.();
  keepSectionLinkVisible(id);
}

function holdRequestedSection(
  state: ActiveSectionState,
  entries: IntersectionObserverEntry[]
): boolean {
  const requested = state.requested;
  if (!requested) return false;
  const arrived = entries.some((entry) => entry.isIntersecting && entry.target.id === requested);
  if (arrived) state.requested = undefined;
  return true;
}

function followDocumentEdge(state: ActiveSectionState): void {
  if (window.scrollY === 0 && !state.requested) activateSection(state, "overview", false);
}

function firstVisibleSection(entries: IntersectionObserverEntry[]): string | undefined {
  return entries
    .filter((entry) => entry.isIntersecting)
    .toSorted(
      (a, b) =>
        Math.abs(a.boundingClientRect.top - READING_LINE) -
        Math.abs(b.boundingClientRect.top - READING_LINE)
    )[0]?.target.id;
}

function observeSections(state: ActiveSectionState, entries: IntersectionObserverEntry[]): void {
  const id = firstVisibleSection(entries);
  if (holdRequestedSection(state, entries)) {
    state.observed = id;
    return;
  }
  state.observed = undefined;
  if (id) activateSection(state, id, false);
}

function subscribeToSections(state: ActiveSectionState, onStoreChange: () => void): () => void {
  state.notify = onStoreChange;
  const followHash = () => {
    const id = hashSection();
    if (!id) return;
    activateSection(state, id, true);
    alignHashDestination();
  };
  const followEdge = followDocumentEdge.bind(null, state);
  const observer = new IntersectionObserver((entries) => observeSections(state, entries), {
    threshold: 0,
  });
  for (const id of dashboardSectionIds) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
  window.addEventListener("hashchange", followHash);
  window.addEventListener("scroll", followEdge, { passive: true });
  settleRequestedSection(state);
  keepSectionLinkVisible(state.active);
  return () => {
    state.notify = undefined;
    observer.disconnect();
    window.removeEventListener("hashchange", followHash);
    window.removeEventListener("scroll", followEdge);
  };
}

function activeSectionStore() {
  const hashed = hashSection();
  const state: ActiveSectionState = { active: hashed ?? "overview", requested: hashed };
  return {
    subscribe: (onStoreChange: () => void) => subscribeToSections(state, onStoreChange),
    activate: (id: string) => activateSection(state, id, true),
    getSnapshot: () => state.active,
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
      data-dashboard-section={id}
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

export function DashboardSidebar() {
  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-0 bg-[var(--playloom-ink)] text-[#f5efe2]"
      mobileTitle="Navigate Playloom"
      mobileDescription="Choose a dashboard chapter. Every destination is available in this scrollable drawer."
    >
      <SidebarContent className="min-h-0 overflow-y-auto overscroll-contain py-7">
        <ChapterNav />
      </SidebarContent>
    </Sidebar>
  );
}
