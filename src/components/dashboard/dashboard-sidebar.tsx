import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  Coins,
  Gamepad2,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  PieChart,
  Receipt,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
}

const DASHBOARD_SECTIONS: readonly Section[] = [
  { icon: LayoutDashboard, id: "overview", label: "Overview" },
  { icon: Trophy, id: "top-games", label: "Top games" },
  { icon: PieChart, id: "genres-franchises", label: "Genres & franchises" },
  { icon: CalendarRange, id: "timeline", label: "Timeline" },
  { icon: Trophy, id: "trophies", label: "Trophies" },
  { icon: Lightbulb, id: "insights", label: "Insights" },
  { icon: Sparkles, id: "ask-ai", label: "Ask an AI" },
  { icon: Coins, id: "spend", label: "Spend" },
  { icon: Receipt, id: "purchase-history", label: "Purchase history" },
  { icon: Gamepad2, id: "all-games", label: "All games" },
];

const SECTION_IDS: readonly string[] = DASHBOARD_SECTIONS.map((section) => section.id);

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: "-15% 0px -75% 0px",
  threshold: 0,
};

/** The topmost section currently intersecting the viewport, if any. */
function topVisibleSection(entries: readonly IntersectionObserverEntry[]): string | undefined {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
  return visible[0]?.target.id;
}

/** SSR-safe scroll-spy store: an IntersectionObserver feeds the section in view. */
function createActiveSectionStore(): {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => string;
  getServerSnapshot: () => string;
} {
  let active = "overview";
  let notify: (() => void) | undefined;

  function setActive(id: string): void {
    if (id === active) return;
    active = id;
    notify?.();
  }

  return {
    subscribe(onStoreChange) {
      notify = onStoreChange;
      let observer: IntersectionObserver | undefined;
      const timer = window.setTimeout(() => {
        observer = new IntersectionObserver((entries) => {
          const id = topVisibleSection(entries);
          if (id) setActive(id);
        }, OBSERVER_OPTIONS);
        for (const id of SECTION_IDS) {
          const el = document.getElementById(id);
          if (el) observer.observe(el);
        }
      }, 0);

      return () => {
        notify = undefined;
        window.clearTimeout(timer);
        observer?.disconnect();
      };
    },
    getSnapshot: () => active,
    getServerSnapshot: () => "overview",
  };
}

/** SSR-safe scroll-spy: tracks which section is in view. */
function useActiveSection(): string {
  const [store] = useState(createActiveSectionStore);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

function NavMenu({
  active,
  onNavigate,
}: {
  active: string;
  onNavigate: (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.ReactElement {
  return (
    <SidebarMenu>
      {DASHBOARD_SECTIONS.map((section) => (
        <SidebarMenuItem key={section.id}>
          <SidebarMenuButton
            isActive={active === section.id}
            tooltip={section.label}
            render={
              <a href={`#${section.id}`} onClick={onNavigate(section.id)}>
                <section.icon />
                <span>{section.label}</span>
              </a>
            }
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function DashboardSidebar(): React.ReactElement {
  const active = useActiveSection();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleNavigate =
    (id: string) =>
    (event: React.MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (isMobile) setOpenMobile(false);
    };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link
          to="/"
          aria-label="PSN Playtime — go to home page"
          className="hit-area-1 flex items-center gap-2 rounded-md px-2 py-1 outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Gamepad2 className="size-5 text-primary" />
          <span className="font-semibold group-data-[collapsible=icon]:hidden">PSN Playtime</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sections</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavMenu active={active} onNavigate={handleNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
