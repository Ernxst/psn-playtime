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
      ["spending", "Summary & ledger"],
      ["purchase-data", "Connected purchase data"],
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

// The existing dashboard contract uses link semantics but scrolls without mutating the URL hash.
// oxlint-disable jsx-a11y/prefer-tag-over-role
function ChapterNav() {
  const [store] = useState(activeSectionStore);
  const active = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Dashboard chapters" className="playloom-spine-nav">
      {chapters.map((chapter) => (
        <div key={chapter.label}>
          <span>{chapter.label}</span>
          {chapter.sections.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="link"
              aria-current={active === id ? "location" : undefined}
              data-active={active === id}
              onClick={() => {
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                if (isMobile) setOpenMobile(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
// oxlint-enable jsx-a11y/prefer-tag-over-role

export function DashboardSidebar({
  profile = demoDashboard.profile,
}: {
  profile?: ProfileSummary;
}) {
  return (
    <Sidebar collapsible="offcanvas" className="playloom-spine">
      <SidebarHeader className="playloom-spine-header">
        <Link to="/" aria-label="Playloom — go to home page">
          Playloom
        </Link>
        <p>
          Your gaming life,
          <br />
          woven together.
        </p>
        <div className="playloom-spine-profile">
          <span>{profile.onlineId.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{profile.onlineId}</strong>
            <small>Personal profile</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ChapterNav />
      </SidebarContent>
      <SidebarFooter className="playloom-spine-footer">
        <a href="https://rawg.io" target="_blank" rel="noreferrer">
          Game metadata and artwork provided by RAWG
        </a>
        <span>Prototype · Issue #327</span>
      </SidebarFooter>
    </Sidebar>
  );
}
