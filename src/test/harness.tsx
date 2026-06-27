import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

interface HarnessOptions {
  /** Initial history entry the memory router boots at. */
  path?: string;
  /** Supply a pre-seeded client (e.g. to prime a suspense query cache). */
  queryClient?: QueryClient;
}

interface Harness {
  queryClient: QueryClient;
  /** Ready-to-render element wiring `ui` in router + query context. */
  element: ReactNode;
}

/**
 * Minimal context harness for route components and anything using router/query
 * hooks (`useNavigate`, `Link`, `useMutation`, `useSuspenseQuery`). The memory
 * router registers `/` and `/dashboard` so `<Link>` targets resolve, and `ui`
 * renders above the matched `<Outlet />`.
 */
export function createHarness(ui: ReactNode, options: HarnessOptions = {}): Harness {
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

  const rootRoute = createRootRoute({
    component: () => (
      <>
        {ui}
        <Outlet />
      </>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dashboard",
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [options.path ?? "/"] }),
    context: { queryClient },
  });

  return {
    queryClient,
    element: (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
  };
}
