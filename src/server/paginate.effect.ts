/**
 * Generic offset pagination over an Effect-returning page fetcher.
 *
 * Provider-agnostic: a caller supplies a `fetchPage(offset)` that returns one
 * page (`items` + an optional server `totalItemCount`) and a page `limit`, and
 * `paginateAll` walks every page with `Stream.paginate`, flattening them into a
 * single array. The termination predicate (`pagingComplete`) lives here too, so
 * the offset → stop → collect logic has one home rather than being copy-pasted
 * per endpoint.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

/**
 * Whether paging should stop. An upstream normally reports `totalItemCount`, but
 * it can omit it; a `?? all.length` fallback would make the stop condition
 * trivially true after a full first page, silently dropping every later page
 * (the #140 bug). So when the count is absent, fall back to page fullness: keep
 * going while the last page was full (more may follow) and stop only on a short
 * or empty page.
 */
function pagingComplete(
  pageSize: number,
  fetched: number,
  totalItemCount: number | undefined,
  limit: number
): boolean {
  if (pageSize === 0) return true;
  if (totalItemCount !== undefined) return fetched >= totalItemCount;
  return pageSize < limit;
}

/** One page of an offset-paginated endpoint. */
export interface Page<A> {
  readonly items: readonly A[];
  readonly totalItemCount: number | undefined;
}

/**
 * Collect every page of an offset-paginated endpoint into one array. The state
 * is the running `offset`; each step fetches one page and `pagingComplete`
 * decides whether to continue with `Option.some(nextOffset)` or stop with
 * `Option.none()`. `Stream.runCollect` flattens the pages.
 */
export const paginateAll = <A, E>(
  limit: number,
  fetchPage: (offset: number) => Effect.Effect<Page<A>, E>
): Effect.Effect<A[], E> =>
  Stream.paginate(0, (offset: number) =>
    fetchPage(offset).pipe(
      Effect.map(({ items, totalItemCount }) => {
        const next = offset + items.length;
        const stop = pagingComplete(items.length, next, totalItemCount, limit);
        return [items, stop ? Option.none() : Option.some(next)] as const;
      })
    )
  ).pipe(Stream.runCollect);
