import { queryOptions } from "@tanstack/react-query";
import { getDashboard } from "@/server/psn";

/** Shared query for the dashboard payload. Demo data is returned when signed out. */
export const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"] as const,
  queryFn: () => getDashboard(),
});
