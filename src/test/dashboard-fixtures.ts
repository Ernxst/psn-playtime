import type { DashboardData } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";

type DashboardDataOverrides = Omit<Partial<DashboardData>, "profile" | "meta"> & {
  readonly profile?: Partial<DashboardData["profile"]>;
  readonly meta?: Partial<DashboardData["meta"]>;
};

export function dashboardData(overrides: DashboardDataOverrides = {}): DashboardData {
  return Dashboard.data(overrides);
}
