import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { dashboardQueryOptions } from "@/components/dashboard/query";
import { DashboardError, DashboardSkeleton } from "@/components/dashboard/states";
import { signOut } from "@/server/psn";

export const Route = createFileRoute("/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueryOptions),
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
  }),
  component: Dashboard,
  pendingComponent: DashboardSkeleton,
  errorComponent: ({ error }) => (
    <DashboardError message={error instanceof Error ? error.message : "Something went wrong."} />
  ),
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQueryOptions);
  const queryClient = useQueryClient();

  const signOutMutation = useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Signed out — showing demo data.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Sign out failed.");
    },
  });

  return (
    <DashboardView
      data={data}
      onSignOut={() => signOutMutation.mutate()}
      signingOut={signOutMutation.isPending}
    />
  );
}
