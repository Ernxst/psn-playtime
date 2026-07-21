import { demoDashboard } from "@/domain/mock";
import type { DashboardData } from "@/server/providers/account/snapshot";

type DashboardDataOverrides = Omit<Partial<DashboardData>, "profile" | "meta"> & {
  readonly profile?: Partial<DashboardData["profile"]>;
  readonly meta?: Partial<DashboardData["meta"]>;
};

export function data(overrides: DashboardDataOverrides = {}): DashboardData {
  return structuredClone({
    ...demoDashboard,
    ...overrides,
    profile: { ...demoDashboard.profile, ...overrides.profile },
    games: overrides.games ?? demoDashboard.games,
    meta: { ...demoDashboard.meta, ...overrides.meta },
  });
}
