import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { type Page, paginateAll } from "./paginate.effect";

/**
 * A real `fetchPage` seam (the module's dependency injection point, not a mock):
 * it slices an in-memory list into limit-sized pages keyed by the item `offset`
 * `paginateAll` threads through, optionally reporting a server `totalItemCount`.
 */
const pageFetcher =
  <A>(items: readonly A[], limit: number, totalItemCount: number | undefined) =>
  (offset: number): Effect.Effect<Page<A>> =>
    Effect.succeed({ items: items.slice(offset, offset + limit), totalItemCount });

describe(".paginateAll", () => {
  it.each([
    {
      scenario: "flattens every page while the reported total has not been reached",
      items: ["a", "b", "c", "d", "e"],
      limit: 2,
      totalItemCount: 5 as number | undefined,
    },
    {
      scenario: "stops at the reported total even when the final page is full",
      items: ["a", "b", "c", "d"],
      limit: 2,
      totalItemCount: 4 as number | undefined,
    },
    {
      scenario:
        "keeps paging while pages stay full and stops on a short page when no total is reported",
      items: ["a", "b", "c"],
      limit: 2,
      totalItemCount: undefined,
    },
    {
      scenario:
        "stops on an empty page when no total is reported and the last full page aligned to the limit",
      items: ["a", "b"],
      limit: 2,
      totalItemCount: undefined,
    },
    {
      scenario: "returns an empty array for an empty first page",
      items: [] as string[],
      limit: 2,
      totalItemCount: undefined,
    },
    {
      scenario: "collects a single page whose size matches the reported total",
      items: ["a", "b", "c"],
      limit: 10,
      totalItemCount: 3 as number | undefined,
    },
  ])("$scenario", async ({ items, limit, totalItemCount }) => {
    const result = await Effect.runPromise(
      paginateAll(limit, pageFetcher(items, limit, totalItemCount))
    );

    expect(result).toEqual(items);
  });

  it("propagates a page fetch failure", async () => {
    const failing = (): Effect.Effect<Page<string>, string> => Effect.fail("boom");

    await expect(Effect.runPromise(paginateAll(2, failing))).rejects.toThrow("boom");
  });
});
